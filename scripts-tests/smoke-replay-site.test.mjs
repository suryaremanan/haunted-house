// Tests for scripts/smoke-replay-site.mjs (replay-and-submission task 6.4;
// Requirements 6.4, 6.5, 11.7). Run with: node --test scripts-tests/smoke-replay-site.test.mjs
//
// Local mode runs against synthetic sites in a temporary folder on a real
// ephemeral loopback server. Deployed mode runs against a fake fetch, a fake
// clock and a fake sleep: no test leaves the machine.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_TOTAL_TIMEOUT_MS,
  LOCAL_PREFIX,
  MAX_DELAY_MS,
  SmokeFailure,
  checkSite,
  deployedBase,
  htmlReferences,
  moduleReferences,
  retryDelayMs,
  shown,
  smokeDeployed,
  smokeLocal,
  startLocalServer,
} from '../scripts/smoke-replay-site.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/smoke-replay-site.mjs', import.meta.url))
const scratch = mkdtempSync(path.join(tmpdir(), 'hh-smoke-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

const INDEX = '<!doctype html><html><head><link rel="stylesheet" href="./assets/index-a1.css"></head><body><div id="root"></div><script type="module" src="./assets/index-b2.js"></script></body></html>'
const MODULE = 'import{a}from"./chunk-c3.js";const u="./fixture.jsonl";fetch(u);console.log(a)'
const FIXTURE = '{"schema_version":1,"event_type":"mansion_opened"}\n'

let counter = 0
/** A clean synthetic site; `change(files)` edits the file map before it is written. */
function site(change = () => {}) {
  const files = {
    'index.html': INDEX,
    'assets/index-a1.css': 'body{margin:0}',
    'assets/index-b2.js': MODULE,
    'assets/chunk-c3.js': 'export const a=1',
    'fixture.jsonl': FIXTURE,
    '.nojekyll': '',
  }
  change(files)
  const root = path.join(scratch, `site-${(counter += 1)}`)
  for (const [name, text] of Object.entries(files)) {
    if (text === null) continue
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    writeFileSync(path.join(root, name), text)
  }
  return root
}

const failure = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof SmokeFailure, String(error))
    assert.equal(error.code, code)
    return true
  })
}

/** A start function that records whether its server was closed. */
function tracked() {
  const state = { started: 0, closed: 0, base: '' }
  const start = async (root) => {
    const server = await startLocalServer(root)
    state.started += 1
    state.base = server.base
    return {
      base: server.base,
      close: async () => {
        await server.close()
        state.closed += 1
      },
    }
  }
  return { state, start }
}

describe('local mode', () => {
  it('loads index, every referenced local file and the fixture beneath a project-site prefix', async () => {
    const { state, start } = tracked()
    const loaded = await smokeLocal(site(), { start })
    assert.deepEqual(loaded.sort(), ['assets/chunk-c3.js', 'assets/index-a1.css', 'assets/index-b2.js', 'fixture.jsonl', 'index.html'])
    assert.match(state.base, new RegExp(`^http://127\\.0\\.0\\.1:\\d+${LOCAL_PREFIX}$`))
    assert.equal(state.closed, 1)
  })

  it('closes the server and frees the port after success', async () => {
    const { state, start } = tracked()
    await smokeLocal(site(), { start })
    await assert.rejects(fetch(state.base, { signal: AbortSignal.timeout(2000) }))
  })

  const broken = [
    ['a missing asset', (f) => (f['assets/chunk-c3.js'] = null), 'http_404'],
    ['a missing fixture', (f) => (f['fixture.jsonl'] = null), 'http_404'],
    ['a missing index', (f) => (f['index.html'] = null), 'http_404'],
    ['an empty module', (f) => (f['assets/chunk-c3.js'] = ''), 'empty_file'],
    ['a page with no root element', (f) => (f['index.html'] = INDEX.replace('id="root"', 'id="app"')), 'root_marker_missing'],
    ['a page with no module script', (f) => (f['index.html'] = '<div id="root"></div>'), 'module_script_missing'],
    ['a remote script', (f) => (f['index.html'] = INDEX.replace('./assets/index-b2.js', 'https://cdn.example/x.js')), 'external_reference'],
    ['a protocol-relative stylesheet', (f) => (f['index.html'] = INDEX.replace('./assets/index-a1.css', '//cdn.example/x.css')), 'external_reference'],
    ['a root-absolute script', (f) => (f['index.html'] = INDEX.replace('./assets/index-b2.js', '/assets/index-b2.js')), 'absolute_reference'],
    ['a traversing script', (f) => (f['index.html'] = INDEX.replace('./assets/index-b2.js', '../../secret.js')), 'traversing_reference'],
    ['an encoded traversal', (f) => (f['index.html'] = INDEX.replace('./assets/index-b2.js', './%2e%2e/%2e%2e/secret.js')), 'traversing_reference'],
    ['a module importing a remote module', (f) => (f['assets/index-b2.js'] = 'import"https://cdn.example/x.js"'), 'external_reference'],
    ['a module importing outside the site', (f) => (f['assets/index-b2.js'] = 'import("../../outside.js")'), 'traversing_reference'],
    ['a fixture that is not JSON lines', (f) => (f['fixture.jsonl'] = '<html>not found</html>'), 'fixture_not_jsonl'],
  ]
  for (const [name, change, code] of broken) {
    it(`fails on ${name} and still closes the server`, async () => {
      const { state, start } = tracked()
      await failure(smokeLocal(site(change), { start }), code)
      assert.equal(state.started, 1)
      assert.equal(state.closed, 1)
    })
  }

  it('closes the server when the request layer itself throws', async () => {
    const { state, start } = tracked()
    const fetchImpl = async () => {
      throw new Error('boom')
    }
    await failure(smokeLocal(site(), { start, fetchImpl }), 'request_failed')
    assert.equal(state.closed, 1)
  })

  it('the server refuses traversal, other methods, folders and symlinks', async () => {
    const root = site()
    writeFileSync(path.join(scratch, 'outside.txt'), 'outside')
    symlinkSync(path.join(scratch, 'outside.txt'), path.join(root, 'link.txt'))
    const server = await startLocalServer(root)
    try {
      const status = async (suffix, init) => (await fetch(new URL(suffix, server.base), init)).status
      assert.equal(await status('index.html'), 200)
      assert.equal(await status(''), 200)
      assert.equal(await status('%2e%2e/outside.txt'), 404)
      assert.equal(await status('..%2Foutside.txt'), 403)
      assert.equal(await status('assets/'), 404)
      assert.equal(await status('link.txt'), 404)
      assert.equal(await status('/index.html'), 404)
      assert.equal(await status('index.html', { method: 'POST' }), 405)
    } finally {
      await server.close()
    }
  })

  it('names only site-relative paths in a failure', async () => {
    const root = site((f) => (f['assets/chunk-c3.js'] = null))
    await assert.rejects(smokeLocal(root), (error) => {
      assert.equal(error.detail, 'assets/chunk-c3.js')
      assert.ok(!error.message.includes(scratch))
      return true
    })
  })
})

describe('command line', () => {
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 30_000, env: {} })

  it('exits 0 for a clean local site with an empty environment', () => {
    const result = run('--local', site())
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /local site loads \(5 file\(s\)/)
  })

  it('exits 1 for a broken local site and prints the relative path only', () => {
    const result = run('--local', site((f) => (f['assets/index-a1.css'] = null)))
    assert.equal(result.status, 1)
    assert.match(result.stderr, /http_404: assets\/index-a1\.css/)
    assert.ok(!result.stderr.includes(scratch))
  })

  it('exits 2 for usage errors', () => {
    assert.equal(run().status, 2)
    assert.equal(run('--local', path.join(scratch, 'absent')).status, 2)
    assert.equal(run('--url').status, 2)
    assert.equal(run('--url', 'http://example.com/site/').status, 2)
    assert.equal(run('--url', 'https://example.com/site/?token=abc').status, 2)
    assert.equal(run('--url', 'https://example.com/site/', '--timeout-ms', '0').status, 2)
    assert.equal(run('--url', 'https://example.com/site/', '--timeout-ms', '99999999').status, 2)
    assert.equal(run('--serve').status, 2)
  })

  it('never prints a query string or credential from a refused URL', () => {
    const result = run('--url', 'https://user:hunter2@example.com/site/?token=abc123#frag')
    assert.equal(result.status, 2)
    const output = result.stdout + result.stderr
    for (const secret of ['hunter2', 'abc123', 'frag']) assert.ok(!output.includes(secret))
  })
})

describe('deployed mode', () => {
  const BASE = 'https://owner.example/project/'
  const pages = {
    [BASE]: INDEX,
    [`${BASE}assets/index-a1.css`]: 'body{margin:0}',
    [`${BASE}assets/index-b2.js`]: MODULE,
    [`${BASE}assets/chunk-c3.js`]: 'export const a=1',
    [`${BASE}fixture.jsonl`]: FIXTURE,
  }

  /** A fake site that answers `failures` whole passes with `status` before it works. */
  function fake({ failures = 0, status = 404, site: body = pages } = {}) {
    const state = { requests: [], slept: [], time: 0, remaining: failures }
    const fetchImpl = async (url, init) => {
      state.requests.push(String(url))
      assert.equal(init.redirect, 'error')
      assert.ok(init.signal instanceof AbortSignal)
      if (String(url) === BASE && state.remaining > 0) {
        state.remaining -= 1
        return new Response('not yet', { status })
      }
      const text = body[String(url)]
      return text === undefined ? new Response('missing', { status: 404 }) : new Response(text, { status: 200 })
    }
    const options = {
      fetchImpl,
      now: () => state.time,
      sleep: async (ms) => {
        state.slept.push(ms)
        state.time += ms
      },
    }
    return { state, options }
  }

  it('accepts only an HTTPS URL without credentials, query or fragment', () => {
    assert.equal(deployedBase('https://owner.example/project'), BASE)
    assert.equal(deployedBase('https://owner.example/project/index.html'), BASE)
    for (const [url, code] of [
      ['http://owner.example/project/', 'url_not_https'],
      ['https://u:p@owner.example/project/', 'url_has_credentials'],
      ['https://owner.example/project/?x=1', 'url_has_query'],
      ['https://owner.example/project/#top', 'url_has_query'],
      ['https://localhost/project/', 'url_is_local'],
      ['https://127.0.0.1/project/', 'url_is_local'],
      ['not a url', 'invalid_url'],
      ['', 'invalid_url'],
    ]) {
      assert.throws(() => deployedBase(url), (error) => error.code === code, url)
    }
    assert.equal(shown('https://owner.example/project/?token=1#x'), 'https://owner.example/project/')
  })

  it('loads the page, its files and the relative fixture on the first attempt', async () => {
    const { state, options } = fake()
    const result = await smokeDeployed(BASE, options)
    assert.equal(result.attempts, 1)
    assert.deepEqual(state.slept, [])
    assert.ok(state.requests.includes(`${BASE}fixture.jsonl`))
    assert.ok(state.requests.every((url) => url.startsWith(BASE)))
  })

  it('retries transient 404 and 5xx answers with capped exponential delays', async () => {
    for (const status of [404, 500, 502, 503]) {
      const { state, options } = fake({ failures: 6, status })
      const result = await smokeDeployed(BASE, options)
      assert.equal(result.attempts, 7)
      assert.deepEqual(state.slept, [1000, 2000, 4000, 8000, 15000, 15000])
    }
    assert.equal(retryDelayMs(1), 1000)
    assert.equal(retryDelayMs(50), MAX_DELAY_MS)
  })

  it('gives up within the total timeout and reports the attempts', async () => {
    const { state, options } = fake({ failures: Number.POSITIVE_INFINITY, status: 503 })
    await assert.rejects(smokeDeployed(BASE, { ...options, totalTimeoutMs: 60_000 }), (error) => {
      assert.equal(error.code, 'http_503')
      assert.ok(error.attempts >= 2)
      return true
    })
    assert.ok(state.time < 60_000, `slept ${state.time} ms`)
    assert.ok(state.slept.every((ms) => ms <= MAX_DELAY_MS))
  })

  it('uses a bounded default and refuses an unbounded timeout', async () => {
    assert.ok(DEFAULT_TOTAL_TIMEOUT_MS <= 600_000)
    const { options } = fake()
    for (const totalTimeoutMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 600_001]) {
      await failure(smokeDeployed(BASE, { ...options, totalTimeoutMs }), 'invalid_timeout')
    }
  })

  it('does not retry a reference that leaves the site', async () => {
    const body = { ...pages, [BASE]: INDEX.replace('./assets/index-b2.js', 'https://cdn.example/x.js') }
    const { state, options } = fake({ site: body })
    await failure(smokeDeployed(BASE, options), 'external_reference')
    assert.deepEqual(state.slept, [])
    assert.ok(state.requests.every((url) => url.startsWith(BASE)))
  })

  it('fails when the deployed fixture is missing, after retries', async () => {
    const body = { ...pages }
    delete body[`${BASE}fixture.jsonl`]
    const { state, options } = fake({ site: body })
    await failure(smokeDeployed(BASE, { ...options, totalTimeoutMs: 10_000 }), 'http_404')
    assert.ok(state.slept.length >= 1)
  })
})

describe('reference parsing', () => {
  it('finds HTML attributes and ignores comments and fragments', () => {
    assert.deepEqual(htmlReferences('<!-- <script src="./old.js"> --><a href="#top"></a><img src=./a.png><link href=\'./b.css\'>'), ['./a.png', './b.css'])
  })

  it('finds static, side-effect and dynamic imports and import.meta URLs, and ignores bare specifiers', () => {
    const source = 'import x from"./a.js";import"./b.js";import("./c.js");export*from"../d.js";new URL("./e.png",import.meta.url);import r from"react";const s="from \\"lodash\\""'
    assert.deepEqual(moduleReferences(source).sort(), ['../d.js', './a.js', './b.js', './c.js', './e.png'])
  })

  it('checkSite resolves a nested module import relative to the module', async () => {
    const base = 'https://owner.example/p/'
    const body = {
      [base]: '<div id="root"></div><script type="module" src="./assets/a.js"></script>',
      [`${base}assets/a.js`]: 'import"./deep/b.js"',
      [`${base}assets/deep/b.js`]: 'import"../c.js"',
      [`${base}assets/c.js`]: 'export{}',
      [`${base}fixture.jsonl`]: FIXTURE,
    }
    const loaded = await checkSite(base, async (url) => (body[url] === undefined ? new Response('', { status: 404 }) : new Response(body[url])))
    assert.deepEqual(loaded.sort(), ['assets/a.js', 'assets/c.js', 'assets/deep/b.js', 'fixture.jsonl', 'index.html'])
  })
})
