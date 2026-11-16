#!/usr/bin/env node
// Checks a built static replay folder before it may be published
// (replay-and-submission task 6.2; Requirements 4.3, 4.4, 4.7, 4.8, 4.9, 11.5).
//
// Usage: node scripts/check-replay-artifact.mjs [dist-replay] [options]
//   Default folder: app/ui/dist-replay, found from this script's location.
//   --fixture <file>         the approved Event Log (default fixtures/replay/demo.jsonl)
//   --python <exe>           interpreter for the Python Publication Gate (default python3)
//   --no-publication-gate    structure and reference checks only (used by unit tests)
//
// What it checks itself:
//   - every entry is a regular, singly linked file (no symlink, hard link, device);
//   - the folder holds only index.html, fixture.jsonl, .nojekyll and assets/**;
//   - fixture.jsonl is byte-for-byte the approved fixture and .nojekyll is empty;
//   - every URL in index.html and every import of every emitted module is
//     relative, stays inside the folder when the site is served beneath a
//     project-site prefix (https://<host>/<project>/), and names an existing file;
//   - no emitted module imports a bare specifier (the live SDK included), a
//     remote URL, or a non-static dynamic import;
//   - no localhost origin and no executable live transport (WebSocket,
//     EventSource, XMLHttpRequest, sendBeacon, service worker).
//
// A shared route constant such as "/api/version" is allowed text: the replay
// stand-in answers it in memory. The DOM transport traps in app/ui prove that
// no request follows; this scan supplements them and does not replace them.
//
// Then it runs scripts/check-replay-publication.py --artifact (credentials,
// home paths, canonical fixture, remote assets) and fails if that gate fails.
//
// Output: one line per finding, sorted: `<file>: <category>`. Matched text is
// never printed. Nothing is written and nothing is published.
// Exit codes: 0 accepted, 1 findings, 2 usage error or missing tool.

import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = 'check-replay-artifact'
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_ARTIFACT = path.join(REPO_ROOT, 'app/ui/dist-replay')
const DEFAULT_FIXTURE = path.join(REPO_ROOT, 'fixtures/replay/demo.jsonl')
const PUBLICATION_GATE = path.join(REPO_ROOT, 'scripts/check-replay-publication.py')

// A stand-in for a GitHub Pages project site. `.invalid` never resolves (RFC 2606).
export const SITE_PREFIX = 'https://pages.invalid/project-site/'
const ENTRY = 'index.html'
const FIXTURE = 'fixture.jsonl'
const NOJEKYLL = '.nojekyll'
const MODULE_FILE = /\.(?:m?js)$/
const TEXT_FILE = /\.(?:html|m?js|css|json|jsonl|svg|txt|map)$/

const LOCALHOST = /(?:https?|wss?):\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?![\w.-])/i
const TRANSPORTS = /\bnew\s+(?:WebSocket|EventSource|XMLHttpRequest|SharedWorker|BroadcastChannel)\s*\(|\bsendBeacon\s*\(|\bserviceWorker\b|\bimportScripts\s*\(/

/** es-module-lexer is a dev dependency of app/ui; load it from there so the repo root needs no install. */
export function loadLexer() {
  const requireFromUi = createRequire(new URL('../app/ui/package.json', import.meta.url))
  try {
    return requireFromUi('es-module-lexer')
  } catch {
    return null
  }
}

/** Every entry under `root` as `{ path, kind, links }`. Links are reported, never followed. */
export function listEntries(root) {
  const entries = []
  const walk = (folder, prefix) => {
    for (const name of readdirSync(folder).sort()) {
      const full = path.join(folder, name)
      const relative = prefix ? `${prefix}/${name}` : name
      const info = lstatSync(full)
      if (info.isSymbolicLink()) entries.push({ path: relative, kind: 'symlink', links: info.nlink })
      else if (info.isDirectory()) walk(full, relative)
      else if (info.isFile()) entries.push({ path: relative, kind: 'file', links: info.nlink })
      else entries.push({ path: relative, kind: 'other', links: info.nlink })
    }
  }
  walk(root, '')
  return entries
}

/** URLs a browser loads from an HTML page: src, href, srcset, poster, data and inline CSS url(). */
export function htmlReferences(html) {
  const found = []
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '')
  for (const match of withoutComments.matchAll(/\s(?:src|href|poster|data|action|formaction|manifest)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    found.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  for (const match of withoutComments.matchAll(/\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const candidate of (match[1] ?? match[2] ?? '').split(',')) {
      const url = candidate.trim().split(/\s+/)[0]
      if (url) found.push(url)
    }
  }
  for (const match of withoutComments.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    found.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return found.filter((url) => url !== '' && !url.startsWith('#'))
}

/**
 * Where a reference written in `fromPath` lands when the site is served under SITE_PREFIX.
 * Returns `{ path }` for a file inside the site, or `{ category }` for a refused reference.
 */
export function resolveReference(reference, fromPath) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) {
    return { category: /^data:/i.test(reference) ? 'data-reference' : 'remote-reference' }
  }
  if (reference.startsWith('/') || reference.startsWith('\\')) return { category: 'absolute-reference' }
  let resolved
  try {
    resolved = new URL(reference, new URL(fromPath, SITE_PREFIX))
  } catch {
    return { category: 'invalid-reference' }
  }
  // A raw or encoded `..` that climbs out is normalised away by URL; compare against the prefix.
  if (!resolved.href.startsWith(SITE_PREFIX) || /%2e|%2f|%5c|\\/i.test(reference)) return { category: 'path-escape' }
  let inside
  try {
    inside = decodeURIComponent(resolved.pathname.slice(new URL(SITE_PREFIX).pathname.length))
  } catch {
    return { category: 'invalid-reference' }
  }
  if (inside === '' || inside.endsWith('/')) inside += ENTRY
  return { path: inside }
}

/**
 * Pure classification of one artifact.
 * `entries` is listEntries() output, `read(path)` returns a Buffer, `fixture` is the approved bytes.
 * Returns sorted, unique `<file>: <category>` lines.
 */
export function classifyArtifact({ entries, read, fixture, lexer }) {
  const findings = new Set()
  const report = (file, category) => findings.add(`${file}: ${category}`)
  const files = new Set()

  for (const entry of entries) {
    if (entry.kind === 'symlink') report(entry.path, 'symlink')
    else if (entry.kind !== 'file') report(entry.path, 'not-regular-file')
    else if (entry.links !== 1) report(entry.path, 'hard-link')
    else files.add(entry.path)
    const allowed = entry.path === ENTRY || entry.path === FIXTURE || entry.path === NOJEKYLL || entry.path.startsWith('assets/')
    if (!allowed) report(entry.path, 'unexpected-file')
  }

  if (!files.has(ENTRY)) report(ENTRY, 'missing-entry')
  if (!files.has(NOJEKYLL)) report(NOJEKYLL, 'missing-nojekyll')
  else if (read(NOJEKYLL).length !== 0) report(NOJEKYLL, 'nojekyll-not-empty')
  if (!files.has(FIXTURE)) report(FIXTURE, 'fixture-missing')
  else if (fixture === null || !read(FIXTURE).equals(fixture)) report(FIXTURE, 'fixture-mismatch')

  const follow = (reference, from) => {
    const target = resolveReference(reference, from)
    if (target.category) report(from, target.category)
    else if (!files.has(target.path)) report(from, 'missing-asset')
  }

  if (files.has(ENTRY)) {
    const html = read(ENTRY).toString('utf8')
    const references = htmlReferences(html)
    for (const reference of references) follow(reference, ENTRY)
    if (!/<script\b[^>]*\btype\s*=\s*["']?module/i.test(html)) report(ENTRY, 'missing-module-script')
    if (/<base\b/i.test(html)) report(ENTRY, 'base-element')
    if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>\s*\S/i.test(html)) report(ENTRY, 'inline-script')
    if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(html)) report(ENTRY, 'meta-refresh')
  }

  for (const file of [...files].sort()) {
    if (!TEXT_FILE.test(file) || file === FIXTURE) continue
    const text = read(file).toString('utf8')
    if (LOCALHOST.test(text)) report(file, 'localhost-origin')
    if (file.endsWith('.css')) for (const reference of htmlReferences(text)) follow(reference, file)
    if (!MODULE_FILE.test(file)) continue
    if (TRANSPORTS.test(text)) report(file, 'live-transport')
    let imports
    try {
      ;[imports] = lexer.parse(text, file)
    } catch {
      report(file, 'unparseable-module')
      continue
    }
    for (const imp of imports) {
      if (imp.type === 'import-meta') continue
      if (typeof imp.specifier !== 'string' || imp.glob) {
        report(file, 'non-static-import')
        continue
      }
      const specifier = imp.specifier
      if (/^@kirocrew\//.test(specifier)) report(file, 'live-sdk-import')
      else if (!specifier.startsWith('./') && !specifier.startsWith('../') && !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(specifier)) {
        report(file, 'bare-import')
      } else follow(specifier, file)
    }
  }
  return [...findings].sort()
}

function parseArguments(args) {
  const options = { artifact: DEFAULT_ARTIFACT, fixture: DEFAULT_FIXTURE, python: 'python3', gate: true }
  const positional = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--no-publication-gate') options.gate = false
    else if (arg === '--fixture' || arg === '--python') {
      const value = args[i + 1]
      if (value === undefined) return null
      options[arg.slice(2)] = arg === '--fixture' ? path.resolve(value) : value
      i += 1
    } else if (arg.startsWith('-')) return null
    else positional.push(arg)
  }
  if (positional.length > 1) return null
  if (positional.length === 1) options.artifact = path.resolve(positional[0])
  return options
}

const isKind = (file, kind) => {
  try {
    const info = lstatSync(file)
    return kind === 'dir' ? info.isDirectory() : info.isFile()
  } catch {
    return false
  }
}

export async function main(args) {
  const options = parseArguments(args)
  if (!options) {
    console.error(`usage: node scripts/check-replay-artifact.mjs [dist-replay] [--fixture <file>] [--python <exe>] [--no-publication-gate]`)
    return 2
  }
  if (!isKind(options.artifact, 'dir')) {
    console.error(`${NAME}: the replay folder is missing; build it first (build:replay in app/ui).`)
    return 2
  }
  const lexer = loadLexer()
  if (!lexer) {
    console.error(`${NAME}: es-module-lexer is not installed (install the app/ui dependencies).`)
    return 2
  }
  await lexer.init()

  const entries = listEntries(options.artifact)
  const findings = classifyArtifact({
    entries,
    read: (file) => readFileSync(path.join(options.artifact, file)),
    fixture: isKind(options.fixture, 'file') ? readFileSync(options.fixture) : null,
    lexer,
  })
  for (const finding of findings) console.log(finding)

  let gateFailed = false
  if (options.gate) {
    const gate = spawnSync(options.python, [PUBLICATION_GATE, '--fixture', options.fixture, '--artifact', options.artifact], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
    })
    if (gate.error || gate.status === null || gate.status === 2) {
      console.error(`${NAME}: the Python Publication Gate could not run.`)
      return 2
    }
    // The gate prints category-only findings; pass them through.
    if (gate.stdout) process.stdout.write(gate.stdout)
    gateFailed = gate.status !== 0
  }

  if (findings.length > 0 || gateFailed) {
    console.error(`${NAME}: the replay folder is not accepted; nothing may be published.`)
    return 1
  }
  console.log(`${NAME}: accepted ${entries.length} file(s)${options.gate ? ' (structure, references and Publication Gate)' : ' (structure and references)'}.`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
