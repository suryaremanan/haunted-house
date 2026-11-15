// Renders a room document from the safe Markdown reader's blocks. Every piece
// of document text becomes a text node: nothing here builds markup from the
// document, and links, images and HTML in it stay visible as written.
import { Check, Square } from 'lucide-react'
import { useMemo } from 'react'
import { parseMarkdown, type Block, type Inline, type ListItem } from '../core/markdown-blocks'

export interface MarkdownViewProps {
  text: string
  /**
   * The heading level of the document's top heading, so the document sits
   * under the panel's own headings in the page outline. Default 6.
   */
  baseLevel?: number
}

function Inlines({ parts }: { parts: readonly Inline[] }) {
  return (
    <>
      {parts.map((part, index) => {
        switch (part.kind) {
          case 'code':
            return <code key={index}>{part.text}</code>
          case 'strong':
            return <strong key={index}>{part.text}</strong>
          case 'emphasis':
            return <em key={index}>{part.text}</em>
          default:
            return <span key={index}>{part.text}</span>
        }
      })}
    </>
  )
}

function Item({ item }: { item: ListItem }) {
  return (
    <li className="hh-md-item" style={{ marginLeft: `${item.depth * 1.25}rem` }} data-checked={item.checked ?? undefined}>
      {item.checked === null ? (
        <span className="hh-md-marker" aria-hidden>
          {item.number ?? '•'}
        </span>
      ) : item.checked ? (
        <Check size={14} aria-hidden />
      ) : (
        <Square size={14} aria-hidden />
      )}
      <span>
        {item.checked === null ? (
          item.number === null ? null : (
            <span className="hh-visually-hidden">{item.number} </span>
          )
        ) : (
          // The checkbox state in words, for readers who do not see the icon.
          <span className="hh-visually-hidden">
            {item.checked ? 'Done' : 'Open'}
            {item.optional ? ', optional' : ''}:{' '}
          </span>
        )}
        <Inlines parts={item.inlines} />
        {item.optional ? <span aria-hidden> (optional)</span> : null}
      </span>
    </li>
  )
}

function BlockView({ block, baseLevel }: { block: Block; baseLevel: number }) {
  switch (block.kind) {
    case 'heading':
      return (
        <p className="hh-md-heading" role="heading" aria-level={baseLevel + block.level - 1} data-level={block.level}>
          <Inlines parts={block.inlines} />
        </p>
      )
    case 'paragraph':
      return (
        <p>
          <Inlines parts={block.inlines} />
        </p>
      )
    case 'quote':
      return (
        <p className="hh-md-quote">
          <Inlines parts={block.inlines} />
        </p>
      )
    case 'list':
      return (
        <ul className="hh-md-list">
          {block.items.map((item, index) => (
            <Item key={index} item={item} />
          ))}
        </ul>
      )
    case 'code':
      return (
        <pre data-language={block.language === '' ? undefined : block.language}>
          <code>{block.text}</code>
        </pre>
      )
    case 'rule':
      return <hr />
  }
}

export function MarkdownView({ text, baseLevel = 6 }: MarkdownViewProps) {
  const document = useMemo(() => parseMarkdown(text), [text])
  return (
    <>
      {document.blocks.map((block, index) => (
        <BlockView key={index} block={block} baseLevel={baseLevel} />
      ))}
      {document.truncated ? <p className="hh-artifact-note">The document is longer than this view shows. Its digest covers all of it.</p> : null}
    </>
  )
}
