// A small, safe reading of Markdown for room documents (Spec 5 design "Room
// UI": "rendered Markdown or safe text"). It turns model-authored text into
// plain data blocks; the view renders those as elements, so no markup from
// the document ever reaches the page. Raw HTML, links and images stay literal
// text. Anything this reader does not know is a paragraph.
// No SDK, React, network, or clock.

export type InlineKind = 'text' | 'code' | 'strong' | 'emphasis'

export interface Inline {
  readonly kind: InlineKind
  readonly text: string
}

export interface ListItem {
  /** Nesting level, 0 to 5. */
  readonly depth: number
  /** A task checkbox: true or false; null for a plain item. */
  readonly checked: boolean | null
  /** The Kiro optional-task marker, `- [ ]*`. */
  readonly optional: boolean
  /** "1." for a numbered item, null for a bullet. */
  readonly number: string | null
  readonly inlines: readonly Inline[]
}

export type Block =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly inlines: readonly Inline[] }
  | { readonly kind: 'paragraph'; readonly inlines: readonly Inline[] }
  | { readonly kind: 'quote'; readonly inlines: readonly Inline[] }
  | { readonly kind: 'list'; readonly items: readonly ListItem[] }
  | { readonly kind: 'code'; readonly language: string; readonly text: string }
  | { readonly kind: 'rule' }

export interface MarkdownDocument {
  readonly blocks: readonly Block[]
  /** True when the document was longer than the block limit and the rest was left out. */
  readonly truncated: boolean
}

export const MAX_MARKDOWN_BLOCKS = 1500

// Everything a terminal or a bidi-unaware reader could be tricked by, except tab and line feed.
const UNSAFE = new RegExp(
  `[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f${String.fromCharCode(0x2028, 0x2029)}\\u202a-\\u202e\\u2066-\\u2069]`,
  'g',
)

/** The text with line endings unified and control and bidi-override characters removed. */
export function safeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(UNSAFE, '')
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|((?<![A-Za-z0-9_])_(?![\s_])[^_\n]+(?<!\s)_(?![A-Za-z0-9_]))/g

/** Code spans, strong and emphasis; everything else is literal text. */
export function parseInlines(text: string): Inline[] {
  const inlines: Inline[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) inlines.push({ kind: 'text', text: text.slice(last, index) })
    const raw = match[0]
    if (match[1] !== undefined) inlines.push({ kind: 'code', text: raw.slice(1, -1) })
    else if (match[2] !== undefined) inlines.push({ kind: 'strong', text: raw.slice(2, -2) })
    else inlines.push({ kind: 'emphasis', text: raw.slice(1, -1) })
    last = index + raw.length
  }
  if (last < text.length) inlines.push({ kind: 'text', text: text.slice(last) })
  return inlines
}

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]{0,24})/
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/
const ITEM = /^(\s*)(?:([-*+])|(\d{1,4})[.)])\s+(.*)$/
const CHECKBOX = /^\[( |x|X)\](\*?)\s+(.*)$/
const TABLE_ROW = /^\s*\|.*\|\s*$/

/** Reads `text` into blocks. Never throws; unknown syntax becomes paragraphs. */
export function parseMarkdown(text: string, maxBlocks = MAX_MARKDOWN_BLOCKS): MarkdownDocument {
  const lines = safeText(text).split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  let items: ListItem[] = []
  let truncated = false

  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', inlines: parseInlines(paragraph.join(' ')) })
      paragraph = []
    }
    if (items.length > 0) {
      blocks.push({ kind: 'list', items })
      items = []
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (blocks.length >= maxBlocks) {
      truncated = true
      break
    }
    const line = lines[index]
    const fence = FENCE.exec(line)
    if (fence !== null) {
      flush()
      const body: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trimStart().startsWith(fence[1])) {
        body.push(lines[index])
        index += 1
      }
      blocks.push({ kind: 'code', language: fence[2], text: body.join('\n') })
      continue
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading !== null) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6, inlines: parseInlines(heading[2]) })
      continue
    }
    if (RULE.test(line)) {
      flush()
      blocks.push({ kind: 'rule' })
      continue
    }
    if (TABLE_ROW.test(line)) {
      // A table keeps its own alignment: shown as written, in a fixed-width block.
      flush()
      const rows = [line]
      while (index + 1 < lines.length && TABLE_ROW.test(lines[index + 1])) {
        index += 1
        rows.push(lines[index])
      }
      blocks.push({ kind: 'code', language: 'table', text: rows.join('\n') })
      continue
    }
    const item = ITEM.exec(line)
    if (item !== null) {
      if (paragraph.length > 0) flush()
      const box = CHECKBOX.exec(item[4])
      items.push({
        depth: Math.min(Math.floor(item[1].replace(/\t/g, '  ').length / 2), 5),
        checked: box === null ? null : box[1] !== ' ',
        optional: box !== null && box[2] === '*',
        number: item[3] === undefined ? null : `${item[3]}.`,
        inlines: parseInlines(box === null ? item[4] : box[3]),
      })
      continue
    }
    if (line.trimStart().startsWith('>')) {
      flush()
      blocks.push({ kind: 'quote', inlines: parseInlines(line.trimStart().replace(/^>\s?/, '')) })
      continue
    }
    if (items.length > 0) flush()
    paragraph.push(line.trim())
  }
  if (!truncated) flush()
  return { blocks, truncated }
}

/** All text of a document in reading order, for tests and plain fallbacks. */
export function plainText(document: MarkdownDocument): string {
  const inline = (inlines: readonly Inline[]) => inlines.map((part) => part.text).join('')
  return document.blocks
    .map((block) => {
      switch (block.kind) {
        case 'list':
          return block.items.map((item) => inline(item.inlines)).join('\n')
        case 'code':
          return block.text
        case 'rule':
          return ''
        default:
          return inline(block.inlines)
      }
    })
    .join('\n')
}
