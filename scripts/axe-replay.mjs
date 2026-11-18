// Runs axe-core inside a real browser (headless Comet over CDP) on the static
// replay, where colour contrast and target size can be measured, which jsdom
// cannot. States: the Gate, the Workshop at the held moment, the Attic at the
// end of the recording, the practice question, and the open Attic sheet; at
// 1280x720 and 390x844, at the Calm, Eerie and Dread levels.
//
//   bun scripts/axe-replay.mjs <out.json>      (Comet on 9333, the replay on 127.0.0.1:8765)
//
// Writes every violation found, by state. axe-core is the UI's dev dependency;
// its source is injected into the page under test and sent nowhere else.
import { readFileSync, writeFileSync } from 'node:fs'
import { connect } from './lib/cdp.mjs'

const out = process.argv[2]
const AXE = readFileSync(new URL('../app/ui/node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const browser = await connect(9333)
const setRange = (v) => `(() => { const r = document.querySelector('.hh-ui-replay-range'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, String(${v})); r.dispatchEvent(new Event('input', {bubbles: true})); r.dispatchEvent(new Event('change', {bubbles: true})); })()`
const results = []

async function audit(page, state) {
  await page.pause(400)
  const found = await page.eval(`(async () => { if (!window.axe) { ${AXE}\n } const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} } }); return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(' ')).slice(0, 5) })) })()`)
  results.push({ state, violations: found })
}

for (const [w, h] of [[1280, 720], [390, 844]]) {
  for (const level of w === 1280 ? ['calm', 'eerie', 'dread'] : ['eerie']) {
    const page = await browser.newPage()
    await page.size(w, h)
    await page.go('http://127.0.0.1:8765/')
    await page.until('document.querySelector("[data-gate-screen] input")')
    if (level === 'eerie') await audit(page, `gate ${w}`)
    await page.click('[data-guide-option="knock"]')
    await page.until('[...document.querySelectorAll("button")].some(b => /Watch demo-mansion/.test(b.textContent))')
    await page.eval(`[...document.querySelectorAll("button")].find(b => /Watch demo-mansion/.test(b.textContent)).click()`)
    await page.until('document.querySelector(".hh-ui[aria-busy=false]")')
    for (let i = 0; i < 3 && (await page.eval('document.querySelector(".hh-ui").dataset.fright')) !== level; i++) await page.eval('document.querySelector("[data-fright-toggle]").click()')
    await page.eval(setRange(64))
    await audit(page, `held moment ${level} ${w}`)
    await page.eval(setRange('document.querySelector(".hh-ui-replay-range").max'))
    await audit(page, `end ${level} ${w}`)
    if (level === 'eerie') {
      await page.eval(`document.querySelector('[data-room-control="attic"]').click()`)
      await audit(page, `attic sheet ${w}`)
      await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await page.eval(setRange(63))
      await page.eval('document.querySelector("[data-practice-toggle]").click()')
      await page.eval(setRange(0))
      await page.eval(`document.querySelector('[data-guide-control="replay:toggle"]').click()`)
      await page.until('document.querySelector("[data-practice-question]")', { timeoutMs: 60_000 })
      await audit(page, `practice question ${w}`)
    }
    page.close()
  }
}
const summary = { tool: 'axe-core in headless Comet', tags: TAGS, states: results.length, violations: results.reduce((n, r) => n + r.violations.length, 0), results }
writeFileSync(out, JSON.stringify(summary, null, 1) + '\n')
console.log(`states ${summary.states}, violations ${summary.violations}`)
browser.close()
process.exit(0)
