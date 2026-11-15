// @vitest-environment node
// Requirement 7.1: the UI imports @kirocrew/app-sdk only from the SDK adapter,
// src/adapters/sdk.ts. The replay build swaps the SDK by aliasing that one
// import, so any other importer would break the replay or the live page.
//
// Imports are found with a real TS/TSX parser (Vite's parseAst) rather than
// es-module-lexer or a regex: the lexer stops at JSX (src/App.tsx) and skips
// type-position imports such as `typeof import('m')`; stripping TS first would
// erase `import type`, which counts here; a regex matches comments and strings.
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

const ADAPTER = '/src/adapters/sdk.ts'

// Raw source of every UI module, keyed by its path from app/ui (e.g. /src/App.tsx).
// The replay stand-in under src/adapters/sdk-shim/ is included: it must not import the SDK either.
const sources = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '/replay/**/*.{ts,tsx}', '!**/*.test.{ts,tsx}', '!**/*.d.ts'],
  { query: '?raw', import: 'default', eager: true },
)

interface ModuleRef {
  /** The imported module, or null for a dynamic import with a computed argument. */
  specifier: string | null
  line: number
}

interface AstNode {
  type: string
  start: number
  [key: string]: unknown
}

function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

/** The string a specifier node spells out, or null if it is computed. */
function staticString(node: unknown): string | null {
  if (!isNode(node)) return null
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TSLiteralType') return staticString(node.literal)
  if (node.type === 'TemplateLiteral' && Array.isArray(node.expressions) && node.expressions.length === 0) {
    const [quasi] = node.quasis as { value: { cooked: string | null } }[]
    return quasi?.value.cooked ?? null
  }
  return null
}

/** What module a node refers to: a specifier, null if computed, undefined if the node imports nothing. */
function referencedModule(node: AstNode): string | null | undefined {
  switch (node.type) {
    case 'ImportDeclaration': // import x from 'm', import type { T } from 'm', import 'm'
    case 'ExportNamedDeclaration': // export { a } from 'm', export type { T } from 'm'
    case 'ExportAllDeclaration': // export * from 'm'
      return node.source == null ? undefined : staticString(node.source)
    case 'ImportExpression': // import('m')
      return staticString(node.source)
    case 'TSImportType': // typeof import('m'), import('m').T
      return staticString(node.source ?? node.argument)
    case 'TSExternalModuleReference': // import x = require('m')
      return staticString(node.expression)
    default:
      return undefined
  }
}

function moduleRefs(file: string, source: string): ModuleRef[] {
  const ast = parseAst(source, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' }, file)
  const lineOf = (offset: number) => source.slice(0, offset).split('\n').length
  const refs: ModuleRef[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== 'object' || value === null) return
    if (isNode(value)) {
      const specifier = referencedModule(value)
      if (specifier !== undefined) refs.push({ specifier, line: lineOf(value.start) })
    }
    Object.values(value).forEach(visit)
  }
  visit(ast)
  return refs.sort((a, b) => a.line - b.line)
}

function isSdk(specifier: string): boolean {
  return specifier === '@kirocrew/app-sdk' || specifier.startsWith('@kirocrew/app-sdk/')
}

describe('SDK import boundary', () => {
  it('detects every import form and ignores comments and strings', () => {
    const sample = [
      "import { useAppApi } from '@kirocrew/app-sdk'",
      "import type { T } from '@kirocrew/app-sdk/types'",
      "import '@kirocrew/app-sdk'",
      "export { useAppEvents } from '@kirocrew/app-sdk'",
      "export type { U } from '@kirocrew/app-sdk'",
      "export * from '@kirocrew/app-sdk'",
      "const lazy = () => import('@kirocrew/app-sdk')",
      "type Sdk = typeof import('@kirocrew/app-sdk')",
      "// import { useAppApi } from '@kirocrew/app-sdk'",
      `const text = "import x from '@kirocrew/app-sdk'"`,
      'export const View = () => <p>{text}</p>',
      'const computed = (name: string) => import(name)',
    ].join('\n')
    const sdk = (line: number, specifier = '@kirocrew/app-sdk') => ({ specifier, line })
    expect(moduleRefs('/sample.tsx', sample)).toEqual([
      sdk(1),
      sdk(2, '@kirocrew/app-sdk/types'),
      sdk(3),
      sdk(4),
      sdk(5),
      sdk(6),
      sdk(7),
      sdk(8),
      { specifier: null, line: 12 },
    ])
  })

  const files = Object.keys(sources).sort()
  const refsByFile = files.map((file) => ({ file, refs: moduleRefs(file, sources[file]) }))

  it('scans the UI sources, including the replay stand-in, without tests or declarations', () => {
    expect(files).toEqual(expect.arrayContaining([ADAPTER, '/src/App.tsx', '/src/adapters/sdk-shim/index.ts']))
    expect(files.filter((f) => /\.test\.tsx?$|\.d\.ts$/.test(f))).toEqual([])
  })

  it('finds @kirocrew/app-sdk imports in src/adapters/sdk.ts and nowhere else', () => {
    const importers = refsByFile.flatMap(({ file, refs }) =>
      refs.filter((r) => r.specifier !== null && isSdk(r.specifier)).map((r) => ({ file, line: r.line })),
    )
    expect(importers.filter((i) => i.file !== ADAPTER).map((i) => `${i.file}:${i.line}`)).toEqual([])
    expect(importers.some((i) => i.file === ADAPTER)).toBe(true)
  })

  it('has no dynamic import with a computed argument, which could load the SDK unseen', () => {
    const computed = refsByFile.flatMap(({ file, refs }) =>
      refs.filter((r) => r.specifier === null).map((r) => `${file}:${r.line}`),
    )
    expect(computed).toEqual([])
  })
})
