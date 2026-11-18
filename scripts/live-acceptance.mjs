// The browser half of scripts/live-acceptance.sh. Reads its inputs from the
// environment the shell script sets; writes spikes/fixtures/live-acceptance.json.
// The dashboard URL (it carries a sign-in token) is used to open the page and
// is never printed or written.
import { writeFileSync } from 'node:fs'
import { connect } from './lib/cdp.mjs'

const env = process.env
const startedAt = new Date().toISOString()
const steps = []
const step = (id, pass, detail = '') => {
  steps.push({ id, pass, detail })
  console.log(`live-acceptance: ${pass ? 'PASS' : 'FAIL'} ${id}${detail ? ` (${detail})` : ''}`)
}

function preflight() {
  step('gateway-answers', env.HH_LIVE_STATUS_OK === 'true')
  let info = null
  try {
    info = JSON.parse(env.HH_LIVE_APP_INFO || 'null')
  } catch {
    info = null
  }
  step('app-installed', info !== null && info.name === 'haunted-house', info ? `version ${info.version}` : 'not found')
  step('app-enabled', info?.enabled === true)
  step('app-trusted', info?.approvedGrantsStored === true && info?.sessionApprovalConsentPending === false)
  step('installed-from-this-checkout', typeof info?.source === 'string' && info.source === `${env.HH_LIVE_ROOT}/app`)
  return info
}

function write(phase, extra = {}) {
  const evidence = {
    spike: 'live-acceptance',
    startedAt,
    finishedAt: new Date().toISOString(),
    phase,
    result: steps.every((entry) => entry.pass) ? 'pass' : 'fail',
    steps,
    ...extra,
  }
  // Nothing personal: no token, no home path.
  const text = JSON.stringify(evidence, null, 1).replaceAll(env.HOME ?? '\u0000', '~')
  writeFileSync(env.HH_LIVE_OUT, `${text}\n`)
}

const info = preflight()
if (env.HH_LIVE_PHASE !== 'walk') {
  write('preflight', { appVersion: info?.version ?? null })
  process.exit(0)
}

const minutes = (name, fallback) => Number(env[name] ?? fallback) * 60_000
const browser = await connect(Number(env.HH_LIVE_PORT))
const page = await browser.newPage()
await page.size(1280, 800)
const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
const pressByText = (pattern) =>
  page.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => ${pattern}.test(x.textContent)); if (!b) return false; b.click(); return true })()`)

try {
  // Sign in with the owner's URL, then open the app's page.
  await page.go(env.HH_DASHBOARD_URL)
  const origin = await page.eval('location.origin')
  let found = false
  for (const path of ['/apps/haunted-house', '/#/apps/haunted-house', '/app/haunted-house']) {
    await page.go(`${origin}${path}`)
    try {
      await page.until('document.querySelector(".hh-house")', { timeoutMs: 20_000 })
      found = true
      break
    } catch {
      // try the next route
    }
  }
  step('page-opens-in-crew', found)
  if (!found) throw new Error('The installed page did not open.')

  // The Gate, if this browser has not knocked, then what to build.
  if (await page.eval('document.querySelector("[data-gate-screen]") !== null')) await page.click('[data-guide-option="knock"]')
  if (await page.eval('document.querySelector("[data-idea-step]") === null')) await pressByText('/^Build something new/')
  await page.until('document.querySelector("[data-idea-step] textarea")')
  const idea = `A small command-line tool that prints the phase of the moon (${startedAt.slice(0, 16)})`
  await page.eval(`(() => { const t = document.querySelector('[data-idea-step] textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify(idea)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const folder = (await text('[data-idea-name]'))?.replace(/^Project folder: /, '') ?? null
  await page.click('[data-guide-option="build-this"]')
  await page.until('document.querySelector(".hh-ui[aria-busy=false]")', { timeoutMs: 60_000 })
  step('mansion-created-and-opened', true, folder ?? '')

  // A real ghost run: the Archivist writes the requirements.
  const started = await pressByText('/^Have the Archivist write what it must do/')
  step('archivist-started', started)
  await page.until('/The door waits for you/.test(document.querySelector("[data-guide-text]")?.textContent ?? "")', { timeoutMs: minutes('HH_WAIT_MINUTES', 15), everyMs: 2_000 })
  step('requirements-written-door-waits', true, (await text('[data-guide-text]')) ?? '')

  // The owner's decision.
  console.log('live-acceptance: WAITING FOR YOU — in your Crew window, open Haunted House, go to the Study and press "Open the door".')
  await page.until('document.querySelector(\'[data-door-control="requirements"]\')?.getAttribute("data-door") === "open"', {
    timeoutMs: minutes('HH_DECIDE_MINUTES', 15),
    everyMs: 2_000,
  })
  step('owner-opened-the-door', true)
  step('no-failed-request', page.failed.length === 0, page.failed.length === 0 ? '' : `${page.failed.length} failed`)
  write('walk', { appVersion: info?.version ?? null, mansionFolder: folder })
} catch (error) {
  step('walk-finished', false, error instanceof Error ? error.message.slice(0, 160) : 'unknown error')
  write('walk', { appVersion: info?.version ?? null })
  process.exitCode = 1
} finally {
  page.close()
  browser.close()
}
