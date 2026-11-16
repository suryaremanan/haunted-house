#!/usr/bin/env node
// Checks that the live UI bundle imports only the modules the Crew dashboard
// supplies at runtime (Requirement 4.2). Any other import would fail in the
// dashboard, or load a second copy of React and break hooks.
//
// Usage: node scripts/check-bundle-imports.mjs [bundle.mjs]
//   Default bundle: app/ui/dist/index.mjs, found from this script's location,
//   so the command works from any directory.
//
// Allowed:
//   - the host modules below, and any @kirocrew/app-sdk/<subpath>
//   - relative imports of files that exist inside the bundle's folder; those
//     files (chunks) are checked the same way
// Reported, one line each as `<file>:<line>: <specifier> (<reason>)`:
//   - any other bare specifier, including `export ... from` and dynamic import()
//   - URLs (http:, https:, //, data:, blob:, any other scheme) and absolute paths
//   - relative imports that are missing or leave the bundle's folder
//   - dynamic import() whose argument isn't a static string
//
// Exit codes: 0 clean, 1 problems found, 2 the bundle is missing or can't be
// parsed, or es-module-lexer isn't installed in app/ui.

import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEFAULT_BUNDLE = fileURLToPath(new URL('../app/ui/dist/index.mjs', import.meta.url))

// Keep in step with HOST_MODULES in app/ui/vite.config.ts.
const HOST_MODULES = new Set(['react', 'react-dom', 'react/jsx-runtime', 'lucide-react', '@kirocrew/app-sdk'])
const SDK_SUBPATH = /^@kirocrew\/app-sdk\/.+$/

const PREFIX = 'check-bundle-imports'

/** es-module-lexer is a dev dependency of app/ui; load it from there so the repo root needs no install. */
function loadLexer() {
  const requireFromUi = createRequire(new URL('../app/ui/package.json', import.meta.url))
  try {
    return requireFromUi('es-module-lexer')
  } catch {
    return null
  }
}

/** Path relative to the working directory when it is inside it, else absolute. */
function display(file) {
  const rel = path.relative(process.cwd(), file)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : file
}

function isFile(file) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

function isRelative(spec) {
  return spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../')
}

/** Returns why a non-relative specifier is refused, or null if the host supplies it. */
function refusal(spec) {
  if (HOST_MODULES.has(spec) || SDK_SUBPATH.test(spec)) return null
  if (spec.startsWith('//')) return 'protocol-relative URL'
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(spec)?.[1].toLowerCase()
  if (scheme === 'http' || scheme === 'https') return 'remote URL'
  if (scheme === 'data' || scheme === 'blob') return `${scheme}: URL`
  if (scheme) return `${scheme}: URL scheme is not allowed`
  if (spec.startsWith('/')) return 'absolute path'
  return 'bare specifier is not a host module'
}

/** Maps a source offset to a 1-based line number. */
function lineFinder(source) {
  const starts = [0]
  for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) starts.push(i + 1)
  return (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

async function main(args) {
  if (args.length > 1) {
    console.error(`${PREFIX}: expected at most one bundle path, got ${args.length}`)
    console.error('usage: node scripts/check-bundle-imports.mjs [bundle.mjs]')
    return 2
  }
  const bundle = args[0] ? path.resolve(args[0]) : DEFAULT_BUNDLE
  if (!isFile(bundle)) {
    console.error(`${PREFIX}: bundle not found: ${display(bundle)} (run bun run --cwd app/ui build)`)
    return 2
  }
  const lexer = loadLexer()
  if (!lexer) {
    console.error(`${PREFIX}: es-module-lexer is not installed (run bun install --cwd app/ui --frozen-lockfile)`)
    return 2
  }
  await lexer.init()

  const bundleDir = path.dirname(bundle)
  const queue = [bundle]
  const seen = new Set(queue)
  const problems = []

  while (queue.length > 0) {
    const file = queue.shift()
    const shown = display(file)
    const source = readFileSync(file, 'utf8')
    let imports
    try {
      ;[imports] = lexer.parse(source, shown)
    } catch (err) {
      console.error(`${PREFIX}: cannot parse ${shown}: ${err instanceof Error ? err.message : String(err)}`)
      return 2
    }
    const lineOf = lineFinder(source)
    const report = (offset, text) => problems.push(`${shown}:${lineOf(offset)}: ${text}`)

    for (const imp of imports) {
      if (imp.type === 'import-meta') continue
      // A template with substitutions comes back as a glob such as `./x/*.js`.
      if (imp.type === 'dynamic' && (imp.specifier === undefined || imp.glob)) {
        report(imp.start, 'non-static dynamic import')
        continue
      }
      const spec = imp.specifier
      if (!isRelative(spec)) {
        const reason = refusal(spec)
        if (reason) report(imp.start, `${spec} (${reason})`)
        continue
      }
      // Resolve as the browser would: a URL relative to the importing module.
      const target = fileURLToPath(new URL(spec, pathToFileURL(file)))
      const inside = path.relative(bundleDir, target)
      if (inside.startsWith('..') || path.isAbsolute(inside)) {
        report(imp.start, `${spec} (relative import leaves the bundle folder)`)
      } else if (!isFile(target)) {
        report(imp.start, `${spec} (relative import not found next to the bundle)`)
      } else if (!seen.has(target)) {
        seen.add(target)
        queue.push(target)
      }
    }
  }

  for (const problem of problems) console.log(problem)
  if (problems.length > 0) {
    console.error(`${PREFIX}: ${problems.length} import problem(s); the bundle may import only host modules`)
    return 1
  }
  console.log(`${PREFIX}: ${display(bundle)} imports only host modules (${seen.size} file(s) checked)`)
  return 0
}

process.exitCode = await main(process.argv.slice(2))
