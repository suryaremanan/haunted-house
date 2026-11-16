// @vitest-environment node
// Static replay build checks (replay-and-submission tasks 6.1, 6.2, 6.4).
// Exercises scripts/check-replay-artifact.mjs on synthetic build folders, the
// replay build configuration and entry as written, and the real
// app/ui/dist-replay folder when a build is present.
// **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 4.9, 11.5**
import { spawnSync } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
// @ts-expect-error The checker is a plain Node script with no type declarations.
import { SITE_PREFIX, classifyArtifact, htmlReferences, listEntries, loadLexer, resolveReference } from '../../../scripts/check-replay-artifact.mjs'

const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(UI_ROOT, '../..')
const SCRIPT = path.join(REPO_ROOT, 'scripts/check-replay-artifact.mjs')
const FIXTURE = readFileSync(path.join(REPO_ROOT, 'fixtures/replay/demo.jsonl'))
const BUILT = path.join(UI_ROOT, 'dist-replay')

const lexer = loadLexer()
await lexer.init()

const scratch = mkdtempSync(path.join(tmpdir(), 'hh-replay-build-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const INDEX =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" crossorigin href="./assets/index-a1.css"></head>' +
  '<body><div id="root"></div><script type="module" crossorigin src="./assets/index-b2.js"></script></body></html>'

type Files = Record<string, string | Buffer | null>
let counter = 0

/** Writes a clean synthetic replay build; `change` edits the file map first. */
function build(change: (files: Files) => void = () => {}): string {
  const files: Files = {
    'index.html': INDEX,
    'assets/index-a1.css': 'body{margin:0}',
    'assets/index-b2.js': 'import{a}from"./chunk-c3.js";const p="/apps/haunted-house/api/whoami";fetch("./fixture.jsonl");console.log(a,p)',
    'assets/chunk-c3.js': 'export const a=1',
    'fixture.jsonl': FIXTURE,
    '.nojekyll': '',
  }
  change(files)
  const root = path.join(scratch, `build-${(counter += 1)}`)
  for (const [name, content] of Object.entries(files)) {
    if (content === null) continue
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    writeFileSync(path.join(root, name), content)
  }
  return root
}

const classify = (root: string): string[] =>
  classifyArtifact({ entries: listEntries(root), read: (file: string) => readFileSync(path.join(root, file)), fixture: FIXTURE, lexer })

const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000 })

describe('a clean replay build', () => {
  it('is accepted, with shared route constants allowed as text', () => {
    expect(classify(build())).toEqual([])
  })

  it('is accepted by the command, structure checks only', () => {
    const result = run(build(), '--no-publication-gate')
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('accepted 6 file(s)')
  })
})

describe('references beneath a project-site prefix', () => {
  it('resolves relative references inside the prefix', () => {
    expect(SITE_PREFIX).toMatch(/^https:\/\/[a-z.]+\/[a-z-]+\/$/)
    expect(resolveReference('./assets/a.js', 'index.html')).toEqual({ path: 'assets/a.js' })
    expect(resolveReference('assets/a.js?v=1#x', 'index.html')).toEqual({ path: 'assets/a.js' })
    expect(resolveReference('../fixture.jsonl', 'assets/a.js')).toEqual({ path: 'fixture.jsonl' })
    expect(resolveReference('./', 'index.html')).toEqual({ path: 'index.html' })
  })

  it.each([
    ['/assets/a.js', 'absolute-reference'],
    ['\\assets\\a.js', 'absolute-reference'],
    ['https://cdn.example/a.js', 'remote-reference'],
    ['//cdn.example/a.js', 'remote-reference'],
    ['http://localhost:8787/api/ws', 'remote-reference'],
    ['data:image/png;base64,AAAA', 'data-reference'],
    ['../outside.js', 'path-escape'],
    ['../../outside.js', 'path-escape'],
    ['./%2e%2e/outside.js', 'path-escape'],
    ['..%2foutside.js', 'path-escape'],
  ])('refuses %s as %s', (reference, category) => {
    expect(resolveReference(reference, 'index.html')).toEqual({ category })
  })

  it('reads src, href, srcset, poster and CSS url() and skips comments and fragments', () => {
    const html = '<!-- <img src="./old.png"> --><img srcset="./a.png 1x, ./b.png 2x" src=./c.png><video poster="./p.png"></video><a href="#x"></a><div style="background:url(./d.png)"></div>'
    expect(htmlReferences(html).sort()).toEqual(['./a.png', './b.png', './c.png', './d.png', './p.png'])
  })
})

describe('a prohibited build is refused', () => {
  const cases: [string, (files: Files) => void, string][] = [
    ['a root-absolute script', (f) => (f['index.html'] = INDEX.replace('./assets/index-b2.js', '/assets/index-b2.js')), 'index.html: absolute-reference'],
    ['a remote script', (f) => (f['index.html'] = INDEX.replace('./assets/index-b2.js', 'https://cdn.example/app.js')), 'index.html: remote-reference'],
    ['a remote stylesheet', (f) => (f['index.html'] = INDEX.replace('./assets/index-a1.css', '//fonts.example/css')), 'index.html: remote-reference'],
    ['a traversing reference', (f) => (f['index.html'] = INDEX.replace('./assets/index-a1.css', '../shared.css')), 'index.html: path-escape'],
    ['a missing asset', (f) => (f['assets/index-a1.css'] = null), 'index.html: missing-asset'],
    ['a missing chunk', (f) => (f['assets/chunk-c3.js'] = null), 'assets/index-b2.js: missing-asset'],
    ['a base element', (f) => (f['index.html'] = INDEX.replace('<head>', '<head><base href="./">')), 'index.html: base-element'],
    ['an inline script', (f) => (f['index.html'] = INDEX.replace('</body>', '<script>track()</script></body>')), 'index.html: inline-script'],
    ['no module script', (f) => (f['index.html'] = '<div id="root"></div>'), 'index.html: missing-module-script'],
    ['a live SDK import', (f) => (f['assets/chunk-c3.js'] = 'export{useAppApi as a}from"@kirocrew/app-sdk"'), 'assets/chunk-c3.js: live-sdk-import'],
    ['a bare import', (f) => (f['assets/chunk-c3.js'] = 'import"react";export const a=1'), 'assets/chunk-c3.js: bare-import'],
    ['a remote import', (f) => (f['assets/chunk-c3.js'] = 'import"https://esm.example/react";export const a=1'), 'assets/chunk-c3.js: remote-reference'],
    ['a computed dynamic import', (f) => (f['assets/chunk-c3.js'] = 'export const a=(x)=>import(x)'), 'assets/chunk-c3.js: non-static-import'],
    ['a WebSocket', (f) => (f['assets/chunk-c3.js'] = 'export const a=()=>new WebSocket(u)'), 'assets/chunk-c3.js: live-transport'],
    ['an EventSource', (f) => (f['assets/chunk-c3.js'] = 'export const a=()=>new EventSource(u)'), 'assets/chunk-c3.js: live-transport'],
    ['an XMLHttpRequest', (f) => (f['assets/chunk-c3.js'] = 'export const a=()=>new XMLHttpRequest()'), 'assets/chunk-c3.js: live-transport'],
    ['a beacon', (f) => (f['assets/chunk-c3.js'] = 'export const a=()=>navigator.sendBeacon(u)'), 'assets/chunk-c3.js: live-transport'],
    ['a service worker', (f) => (f['assets/chunk-c3.js'] = 'export const a=()=>navigator.serviceWorker.register("./sw.js")'), 'assets/chunk-c3.js: live-transport'],
    ['a localhost gateway origin', (f) => (f['assets/chunk-c3.js'] = 'export const a="http://127.0.0.1:8787"'), 'assets/chunk-c3.js: localhost-origin'],
    ['a localhost socket origin', (f) => (f['assets/chunk-c3.js'] = 'export const a="ws://localhost:8787/api/ws"'), 'assets/chunk-c3.js: localhost-origin'],
    ['a changed fixture', (f) => (f['fixture.jsonl'] = Buffer.concat([FIXTURE, Buffer.from('\n')])), 'fixture.jsonl: fixture-mismatch'],
    ['a missing fixture', (f) => (f['fixture.jsonl'] = null), 'fixture.jsonl: fixture-missing'],
    ['a missing .nojekyll', (f) => (f['.nojekyll'] = null), '.nojekyll: missing-nojekyll'],
    ['a .nojekyll with content', (f) => (f['.nojekyll'] = 'x'), '.nojekyll: nojekyll-not-empty'],
    ['a missing index', (f) => (f['index.html'] = null), 'index.html: missing-entry'],
    ['a hidden snapshot beside the fixture', (f) => (f['snapshot.json'] = '{}'), 'snapshot.json: unexpected-file'],
    ['a service worker file', (f) => (f['sw.js'] = 'self.addEventListener("fetch",()=>{})'), 'sw.js: unexpected-file'],
    ['a CSS file loading a remote font', (f) => (f['assets/index-a1.css'] = '@font-face{src:url(https://fonts.example/a.woff2)}'), 'assets/index-a1.css: remote-reference'],
  ]

  it.each(cases)('%s', (_name, change, finding) => {
    const root = build(change)
    expect(classify(root)).toContain(finding)
    const result = run(root, '--no-publication-gate')
    expect(result.status).toBe(1)
    expect(result.stdout).toContain(finding)
  })

  it('a symlink', () => {
    const root = build()
    writeFileSync(path.join(scratch, 'outside.js'), 'export{}')
    symlinkSync(path.join(scratch, 'outside.js'), path.join(root, 'assets/linked.js'))
    expect(classify(root)).toContain('assets/linked.js: symlink')
  })

  it('a hard link', () => {
    const root = build()
    linkSync(path.join(root, 'assets/chunk-c3.js'), path.join(root, 'assets/twin.js'))
    const findings = classify(root)
    expect(findings).toContain('assets/chunk-c3.js: hard-link')
    expect(findings).toContain('assets/twin.js: hard-link')
  })

  it('findings never repeat the offending text', () => {
    const marker = 'zqplantedvalue'
    const root = build((f) => {
      f['index.html'] = INDEX.replace('./assets/index-b2.js', `https://${marker}.example/app.js`)
      f['assets/chunk-c3.js'] = `export const a="http://localhost:8787/${marker}"`
    })
    const result = run(root, '--no-publication-gate')
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).not.toContain(marker)
    expect(result.stdout + result.stderr).not.toContain(scratch)
  })

  it('a missing folder or an unknown option is a usage error', () => {
    expect(run(path.join(scratch, 'absent')).status).toBe(2)
    expect(run('--publish').status).toBe(2)
  })
})

describe('replay build configuration and entry', () => {
  const config = readFileSync(path.join(UI_ROOT, 'vite.replay.config.ts'), 'utf8')
  const html = readFileSync(path.join(UI_ROOT, 'replay/index.html'), 'utf8')
  const entry = readFileSync(path.join(UI_ROOT, 'replay/main.tsx'), 'utf8')

  it('keeps the relative base, the exact SDK alias, no public folder and no preload polyfill', () => {
    expect(config).toContain("base: './'")
    expect(config).toContain('publicDir: false')
    expect(config).toContain('envDir: false')
    expect(config).toContain('find: /^@kirocrew\\/app-sdk$/')
    expect(config).toContain("here('./src/adapters/sdk-shim/index.ts')")
    expect(config).toContain("outDir: here('./dist-replay')")
    expect(config).toContain('modulePreload: { polyfill: false }')
    expect(config).not.toMatch(/external\s*:/)
    expect(config).not.toMatch(/process\.env|loadEnv|define\s*:/)
  })

  it('copies only the canonical fixture and adds .nojekyll', () => {
    expect(config).toContain("here('../../fixtures/replay/demo.jsonl')")
    const emitted = [...config.matchAll(/fileName:\s*'([^']+)'/g)].map((match) => match[1])
    expect(emitted.sort()).toEqual(['.nojekyll', 'fixture.jsonl'])
  })

  it('the page loads one relative module and nothing remote', () => {
    expect(htmlReferences(html)).toEqual(['./main.tsx'])
    expect(html).toContain('<div id="root"></div>')
    expect(html).not.toMatch(/https?:\/\/|serviceWorker|gtag|analytics|<base\b|<link\b/i)
  })

  it('the entry renders the default HauntedHouseApp from src/App and imports no SDK, env or snapshot', () => {
    expect(entry).toContain("import HauntedHouseApp from '../src/App'")
    expect(entry).toContain('render(<HauntedHouseApp />)')
    const imports = [...entry.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    expect(imports.sort()).toEqual(['../src/App', 'react-dom/client'])
    expect(entry).not.toMatch(/import\.meta\.env|process\.env|serviceWorker|fetch\(|localStorage|\.json'/)
  })

  it('the replay output folder is not committed', () => {
    expect(readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8')).toContain('app/ui/dist-replay/')
  })
})

// The real build is checked when it exists. CI and the Pages workflow run the
// command itself right after build:replay, where a missing folder is an error.
describe.skipIf(!existsSync(path.join(BUILT, 'index.html')))('the built app/ui/dist-replay folder', () => {
  it('passes the structure and reference checks', () => {
    expect(classify(BUILT)).toEqual([])
  })

  it('carries the committed fixture byte for byte and an empty .nojekyll', () => {
    expect(readFileSync(path.join(BUILT, 'fixture.jsonl')).equals(FIXTURE)).toBe(true)
    expect(readFileSync(path.join(BUILT, '.nojekyll')).length).toBe(0)
  })

  it('references only relative files that exist', () => {
    const references = htmlReferences(readFileSync(path.join(BUILT, 'index.html'), 'utf8'))
    expect(references.length).toBeGreaterThan(0)
    for (const reference of references) {
      expect(reference.startsWith('./')).toBe(true)
      expect(existsSync(path.join(BUILT, reference))).toBe(true)
    }
  })
})
