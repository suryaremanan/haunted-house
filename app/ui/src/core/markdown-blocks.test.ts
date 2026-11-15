// Safe Markdown reading for room documents (Spec 5 task 9.2).
// **Validates: Requirements 11.1**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import requirementsFixture from '../../../../fixtures/room-ghosts/requirements-valid.md?raw'
import tasksFixture from '../../../../fixtures/room-ghosts/task-plan-valid.md?raw'
import { parseInlines, parseMarkdown, plainText, safeText } from './markdown-blocks'

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, rules and quotes', () => {
    const { blocks, truncated } = parseMarkdown('# Title\n\nFirst line\nsecond line.\n\n---\n\n> quoted\n\n###### Small ##')
    expect(truncated).toBe(false)
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, inlines: [{ kind: 'text', text: 'Title' }] },
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'First line second line.' }] },
      { kind: 'rule' },
      { kind: 'quote', inlines: [{ kind: 'text', text: 'quoted' }] },
      { kind: 'heading', level: 6, inlines: [{ kind: 'text', text: 'Small' }] },
    ])
  })

  it('reads Kiro task checkboxes with nesting, state and the optional marker', () => {
    const { blocks } = parseMarkdown('- [ ] 1. Store entries\n  - [x] 1.1 Create the model\n  - [ ]* 1.3 Write the property test\n    - _Requirements: 1.3_\n1. numbered')
    expect(blocks).toHaveLength(1)
    const [list] = blocks
    expect(list.kind).toBe('list')
    if (list.kind !== 'list') return
    expect(list.items.map((item) => [item.depth, item.checked, item.optional, item.number])).toEqual([
      [0, false, false, null],
      [1, true, false, null],
      [1, false, true, null],
      [2, null, false, null],
      [0, null, false, '1.'],
    ])
    expect(list.items[3].inlines).toEqual([{ kind: 'emphasis', text: 'Requirements: 1.3' }])
  })

  it('keeps fenced code and tables as written, and reads nothing inside a fence', () => {
    const { blocks } = parseMarkdown('```json\n{ "waves": [] }\n- [ ] 9.9 not a task\n```\n| a | b |\n|---|---|\n| 1 | 2 |\n')
    expect(blocks).toEqual([
      { kind: 'code', language: 'json', text: '{ "waves": [] }\n- [ ] 9.9 not a task' },
      { kind: 'code', language: 'table', text: '| a | b |\n|---|---|\n| 1 | 2 |' },
    ])
  })

  it('reads inline code, strong and emphasis and leaves the rest literal', () => {
    expect(parseInlines('Use `Entry` with **care** and *grace*, not snake_case_names or 2 * 3 * 4.')).toEqual([
      { kind: 'text', text: 'Use ' },
      { kind: 'code', text: 'Entry' },
      { kind: 'text', text: ' with ' },
      { kind: 'strong', text: 'care' },
      { kind: 'text', text: ' and ' },
      { kind: 'emphasis', text: 'grace' },
      { kind: 'text', text: ', not snake_case_names or 2 * 3 * 4.' },
    ])
  })

  it('leaves raw HTML, links and images as literal text', () => {
    const source = '<script>alert(1)</script> <img src=x onerror=alert(1)> [click](javascript:alert(1)) ![x](http://example.test/a.png)'
    const { blocks } = parseMarkdown(source)
    expect(blocks).toEqual([{ kind: 'paragraph', inlines: [{ kind: 'text', text: source }] }])
  })

  it('removes control and bidi-override characters and unifies line endings', () => {
    const dirty = `a${String.fromCharCode(0)}b${String.fromCharCode(0x1b)}[31mc\r\nd${String.fromCharCode(0x202e)}e${String.fromCharCode(0x2028)}f`
    expect(safeText(dirty)).toBe('ab[31mc\ndef')
  })

  it('stops at the block limit and says so', () => {
    const many = Array.from({ length: 50 }, (_, index) => `# H${index}`).join('\n')
    const result = parseMarkdown(many, 10)
    expect(result.blocks).toHaveLength(10)
    expect(result.truncated).toBe(true)
    expect(parseMarkdown(many, 50).truncated).toBe(false)
  })

  it('reads the shared requirements and task-plan fixtures', () => {
    const requirements = parseMarkdown(requirementsFixture)
    expect(requirements.blocks[0]).toMatchObject({ kind: 'heading', level: 1 })
    expect(requirements.truncated).toBe(false)
    const tasks = parseMarkdown(tasksFixture)
    const lists = tasks.blocks.filter((block) => block.kind === 'list')
    const boxes = lists.flatMap((block) => (block.kind === 'list' ? block.items.filter((item) => item.checked !== null) : []))
    // 3 top-level tasks and 5 leaves; the checkbox inside the text fence is not one.
    expect(boxes).toHaveLength(8)
    expect(boxes.filter((item) => item.checked)).toHaveLength(1)
    expect(boxes.filter((item) => item.optional)).toHaveLength(2)
    expect(tasks.blocks.filter((block) => block.kind === 'code').map((block) => (block.kind === 'code' ? block.language : ''))).toEqual(['text', 'json'])
  })

  it('never throws, never invents text, and keeps every visible character (generated)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400, unit: 'grapheme' }), (source) => {
        const document = parseMarkdown(source)
        const shown = plainText(document)
        // Every character shown comes from the source.
        const pool = safeText(source)
        for (const character of new Set(Array.from(shown))) {
          if (character === '\n' || character === ' ') continue
          expect(pool.includes(character)).toBe(true)
        }
        expect(shown).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/)
      }),
      { numRuns: 300 },
    )
  })
})
