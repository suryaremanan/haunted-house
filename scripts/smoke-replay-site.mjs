#!/usr/bin/env node
// One-shot smoke check of the static replay site
// (replay-and-submission task 6.3; Requirements 6.4, 6.5, 11.7).
//
// Usage:
//   node scripts/smoke-replay-site.mjs --local [dist-replay]
//       serve the built folder on an ephemeral loopback port beneath a
//       project-site prefix, request index.html, every local file it and its
//       modules reference, and fixture.jsonl, then close the server.
//   node scripts/smoke-replay-site.mjs --url <https URL> [--timeout-ms <n>]
//       request the deployed page and its fixture with bounded retries. The
//       URL must be the page_url output of the Pages deployment; this script
//       never guesses one.
//
// Both modes reject a reference that is remote, absolute or climbs out of the
// site. The process creates no file, contacts no Crew gateway and prints only
// the origin and path of a URL (never a query string, fragment or credential).
// DOM tests prove the fetched JavaScript renders the shared root; this script
// proves packaging and hosting.
//
// Exit codes: 0 the site loads, 1 it does not, 2 usage error.

import { createReadStream, lstatSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = 'smoke-replay-site'
const DEFAULT_ARTIFACT = fileURLToPath(new URL('../app/ui/dist-replay', import.meta.url))
// The local server serves the folder below this path, as a GitHub Pages project site does.
export const LOCAL_PREFIX = '/haunted-house-replay/'
export const ROOT_MARKER = /<div\s+id=["']root["']/
export const DEFAULT_TOTAL_TIMEOUT_MS = 180_000
export const MAX_TOTAL_TIMEOUT_MS = 600_000
export const REQUEST_TIMEOUT_MS = 10_000
export const FIRST_DELAY_MS = 1_000
export const MAX_DELAY_MS = 15_000
const MAX_FILES = 200
const MAX_BODY_BYTES = 32 * 1024 * 1024

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jsonl': 'application/x-ndjson',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

export class SmokeFailure extends Error {
  /** `detail` is a site-relative path or a fixed word. It never holds a response body or a query. */
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
    this.detail = detail
  }
}

/** Origin and path only: what may be logged about a URL. */
export function shown(url) {
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname}`
}

/** The deployed site base: HTTPS, no credential, no query, no fragment, ending in a slash. */
export function deployedBase(value) {
  let url
  try {
    url = new URL(String(value))
  } catch {
    throw new SmokeFailure('invalid_url')
  }
  if (url.protocol !== 'https:') throw new SmokeFailure('url_not_https')
  if (url.username || url.password) throw new SmokeFailure('url_has_credentials')
  if (url.search || url.hash) throw new SmokeFailure('url_has_query')
  if (/^(?:localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url.host)) throw new SmokeFailure('url_is_local')
  if (url.pathname.endsWith('/index.html')) url.pathname = url.pathname.slice(0, -'index.html'.length)
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.href
}

/** URLs an HTML page loads. */
export function htmlReferences(html) {
  const found = []
  const text = html.replace(/<!--[\s\S]*?-->/g, '')
  for (const match of text.matchAll(/\s(?:src|href|poster|data|manifest)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    found.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return found.filter((url) => url !== '' && !url.startsWith('#'))
}

/** Static and dynamic import specifiers of an emitted module, plus `new URL('./x', import.meta.url)`. */
export function moduleReferences(source) {
  const found = []
  const quoted = `(?:"([^"\\n]*)"|'([^'\\n]*)')`
  const rules = [
    new RegExp(`\\bfrom\\s*${quoted}`, 'g'),
    new RegExp(`\\bimport\\s*${quoted}`, 'g'),
    new RegExp(`\\bimport\\s*\\(\\s*${quoted}\\s*\\)`, 'g'),
    new RegExp(`\\bnew\\s+URL\\s*\\(\\s*${quoted}\\s*,\\s*import\\.meta\\.url`, 'g'),
  ]
  for (const rule of rules) for (const match of source.matchAll(rule)) found.push(match[1] ?? match[2] ?? '')
  // Only path-shaped specifiers are requests; a bare specifier inside bundled text is not.
  return found.filter((specifier) => /^\.{0,2}\//.test(specifier) || /^[a-z][a-z0-9+.-]*:/i.test(specifier))
}

/** The absolute URL of `reference` written in the document at `from`, or a SmokeFailure when it leaves the site. */
export function siteUrl(reference, from, base) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) throw new SmokeFailure('external_reference', relativeTo(from, base))
  if (reference.startsWith('/') || reference.startsWith('\\')) throw new SmokeFailure('absolute_reference', relativeTo(from, base))
  const resolved = new URL(reference, from)
  if (!resolved.href.startsWith(base) || /%2e|%2f|%5c|\\/i.test(reference)) {
    throw new SmokeFailure('traversing_reference', relativeTo(from, base))
  }
  resolved.hash = ''
  resolved.search = ''
  return resolved.href
}

function relativeTo(url, base) {
  return url.startsWith(base) ? url.slice(base.length) || 'index.html' : 'site'
}

async function get(url, base, fetchImpl) {
  let response
  try {
    response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    throw new SmokeFailure('request_failed', relativeTo(url, base))
  }
  if (response.status !== 200) throw new SmokeFailure(`http_${response.status}`, relativeTo(url, base))
  const body = Buffer.from(await response.arrayBuffer())
  if (body.length > MAX_BODY_BYTES) throw new SmokeFailure('response_too_large', relativeTo(url, base))
  return body
}

/**
 * One pass over a site: index, every local file reachable from it, and the fixture.
 * Returns the site-relative paths that loaded. Throws SmokeFailure on the first problem.
 */
export async function checkSite(base, fetchImpl = fetch) {
  const indexUrl = base
  const html = (await get(indexUrl, base, fetchImpl)).toString('utf8')
  if (!ROOT_MARKER.test(html)) throw new SmokeFailure('root_marker_missing', 'index.html')
  const first = htmlReferences(html).map((reference) => siteUrl(reference, indexUrl, base))
  if (!first.some((url) => /\.m?js$/.test(new URL(url).pathname))) throw new SmokeFailure('module_script_missing', 'index.html')

  const loaded = ['index.html']
  const seen = new Set(first)
  const queue = [...seen]
  while (queue.length > 0) {
    if (seen.size > MAX_FILES) throw new SmokeFailure('too_many_files')
    const url = queue.shift()
    const body = await get(url, base, fetchImpl)
    if (body.length === 0) throw new SmokeFailure('empty_file', relativeTo(url, base))
    loaded.push(relativeTo(url, base))
    if (!/\.m?js$/.test(new URL(url).pathname)) continue
    for (const reference of moduleReferences(body.toString('utf8'))) {
      const next = siteUrl(reference, url, base)
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }

  const fixtureUrl = siteUrl('./fixture.jsonl', indexUrl, base)
  if (!seen.has(fixtureUrl)) {
    const fixture = (await get(fixtureUrl, base, fetchImpl)).toString('utf8')
    const firstLine = fixture.split('\n', 1)[0]
    let record
    try {
      record = JSON.parse(firstLine)
    } catch {
      throw new SmokeFailure('fixture_not_jsonl', 'fixture.jsonl')
    }
    if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new SmokeFailure('fixture_not_jsonl', 'fixture.jsonl')
    loaded.push('fixture.jsonl')
  }
  return loaded
}

/** Serves `root` beneath LOCAL_PREFIX on 127.0.0.1 and an ephemeral port. Regular files only. */
export function startLocalServer(root) {
  const base = path.resolve(root)
  const server = createServer((request, response) => {
    const fail = (status) => {
      response.writeHead(status, { 'Content-Type': 'text/plain' })
      response.end()
    }
    if (request.method !== 'GET') return fail(405)
    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
    } catch {
      return fail(400)
    }
    if (!pathname.startsWith(LOCAL_PREFIX)) return fail(404)
    let relative = pathname.slice(LOCAL_PREFIX.length)
    if (relative === '' || relative.endsWith('/')) relative += 'index.html'
    const file = path.resolve(base, relative)
    if (file !== base && !file.startsWith(base + path.sep)) return fail(403)
    let info
    try {
      info = lstatSync(file)
    } catch {
      return fail(404)
    }
    if (!info.isFile()) return fail(404)
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
    })
    createReadStream(file).pipe(response)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        base: `http://127.0.0.1:${port}${LOCAL_PREFIX}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.()
            server.close(() => done())
          }),
      })
    })
  })
}

/** Local mode: serve, check once, always close. */
export async function smokeLocal(root, { fetchImpl = fetch, start = startLocalServer } = {}) {
  const server = await start(root)
  try {
    return await checkSite(server.base, fetchImpl)
  } finally {
    await server.close()
  }
}

/** The wait before retry number `attempt` (1-based): 1 s, 2 s, 4 s, 8 s, then 15 s. */
export function retryDelayMs(attempt) {
  return Math.min(FIRST_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
}

/**
 * Deployed mode: retry the whole pass with exponential delays until it loads
 * or the total time is spent. `now` and `sleep` are injectable for tests.
 */
export async function smokeDeployed(
  url,
  { fetchImpl = fetch, totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {},
) {
  const base = deployedBase(url)
  if (!Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 1 || totalTimeoutMs > MAX_TOTAL_TIMEOUT_MS) {
    throw new SmokeFailure('invalid_timeout')
  }
  const deadline = now() + totalTimeoutMs
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { loaded: await checkSite(base, fetchImpl), attempts: attempt }
    } catch (error) {
      if (!(error instanceof SmokeFailure)) throw error
      // A reference that leaves the site will not heal with time.
      const permanent = /_reference$|^root_marker_missing$|^module_script_missing$|^fixture_not_jsonl$/.test(error.code)
      const delay = retryDelayMs(attempt)
      if (permanent || now() + delay >= deadline) {
        error.attempts = attempt
        throw error
      }
      log(`attempt ${attempt} failed (${error.message}); retrying in ${delay} ms`)
      await sleep(delay)
    }
  }
}

function usage() {
  console.error('usage: node scripts/smoke-replay-site.mjs --local [dist-replay]')
  console.error('       node scripts/smoke-replay-site.mjs --url <https URL> [--timeout-ms <1..600000>]')
  return 2
}

export async function main(args) {
  const [mode, ...rest] = args
  try {
    if (mode === '--local') {
      if (rest.length > 1 || rest[0]?.startsWith('-')) return usage()
      const root = rest[0] ? path.resolve(rest[0]) : DEFAULT_ARTIFACT
      let isFolder = false
      try {
        isFolder = lstatSync(root).isDirectory()
      } catch {
        isFolder = false
      }
      if (!isFolder) {
        console.error(`${NAME}: the replay folder is missing; build it first (build:replay in app/ui).`)
        return 2
      }
      const loaded = await smokeLocal(root)
      console.log(`${NAME}: local site loads (${loaded.length} file(s): ${loaded.join(', ')}).`)
      return 0
    }
    if (mode === '--url') {
      const [url, flag, value, ...extra] = rest
      if (!url || extra.length > 0 || (flag !== undefined && flag !== '--timeout-ms')) return usage()
      const totalTimeoutMs = flag ? Number(value) : DEFAULT_TOTAL_TIMEOUT_MS
      let base
      try {
        base = deployedBase(url)
      } catch (error) {
        console.error(`${NAME}: ${error.message}. Pass the HTTPS page_url output of the Pages deployment, with no query string.`)
        return 2
      }
      if (!Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 1 || totalTimeoutMs > MAX_TOTAL_TIMEOUT_MS) return usage()
      const result = await smokeDeployed(base, { totalTimeoutMs, log: (line) => console.error(`${NAME}: ${line}`) })
      console.log(`${NAME}: ${shown(base)} loads after ${result.attempts} attempt(s) (${result.loaded.length} file(s)).`)
      return 0
    }
    return usage()
  } catch (error) {
    if (error instanceof SmokeFailure) {
      console.error(`${NAME}: ${error.message}${error.attempts ? ` after ${error.attempts} attempt(s)` : ''}`)
      return 1
    }
    console.error(`${NAME}: unexpected failure (${error instanceof Error ? error.name : 'error'})`)
    return 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
