// Renders the static replay in a headless Comet over CDP, at the window
// sizes, Fright levels and Still House settings asked for, and checks what a
// person would see: a screenshot of the Gate and of the house at the held
// moment (record 64) and at the end (record 91); that every control's centre
// hits the control itself, so nothing atmospheric covers it; that the page
// never scrolls sideways; and that no request failed.
//
//   Comet --headless=new --remote-debugging-port=9333 --user-data-dir=<profile> &
//   python3 -m http.server 8765 --bind 127.0.0.1 --directory app/ui/dist-replay &
//   bun scripts/capture-house.mjs <out-dir> '[[1280,720],[390,844]]' '["calm","eerie","dread"]' '[false,true]'
//
// Prints the report as JSON. Screenshots are evidence for a person to look at;
// they are not committed.
import { mkdirSync } from 'node:fs'
import { connect } from './lib/cdp.mjs'
const [out, sizesJ, levelsJ, stillJ] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const sizes = JSON.parse(sizesJ); const levels = JSON.parse(levelsJ); const stills = JSON.parse(stillJ ?? '[false]')
const browser = await connect(9333)
const setRange = (v) => `(() => { const r = document.querySelector('.hh-ui-replay-range'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '${v}'); r.dispatchEvent(new Event('input', {bubbles: true})); r.dispatchEvent(new Event('change', {bubbles: true})); })()`
const report = []
for (const [w, h] of sizes) for (const still of stills) {
  const page = await browser.newPage()
  await page.size(w, h); await page.media({ scheme: 'light' })
  await page.go('http://127.0.0.1:8765/')
  await page.until('document.querySelector("[data-gate-screen]")')
  await page.pause(300)
  await page.shot(`${out}/gate-${w}.png`)
  await page.eval(`(() => { const i = document.querySelector('[data-gate-screen] input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Ada'); i.dispatchEvent(new Event('input', {bubbles: true})); })()`)
  await page.click('[data-guide-option="knock"]')
  await page.until('[...document.querySelectorAll("button")].some(b => /Watch demo-mansion/.test(b.textContent))')
  await page.eval(`[...document.querySelectorAll("button")].find(b => /Watch demo-mansion/.test(b.textContent)).click()`)
  await page.until('document.querySelector(".hh-ui[aria-busy=false]")')
  if (still) await page.eval(`[...document.querySelectorAll('.hh-ui-toolbar button')].find(b => /Still house/.test(b.textContent)).click()`)
  let level = await page.eval('document.querySelector(".hh-ui").dataset.fright')
  for (const want of levels) {
    for (let i = 0; i < 3 && level !== want; i++) { await page.eval('document.querySelector("[data-fright-toggle]").click()'); await page.pause(150); level = await page.eval('document.querySelector(".hh-ui").dataset.fright') }
    for (const cursor of [64, 91]) {
      await page.eval(setRange(cursor)); await page.pause(500)
      const tag = `${cursor}-${want}-${still ? 'still' : 'move'}-${w}`
      await page.shot(`${out}/at${tag}.png`)
      // Every control's centre must hit the control itself: nothing atmospheric lies over it.
      const covered = await page.eval(`[...document.querySelectorAll('.hh-ui button, .hh-ui input, .hh-ui summary')].filter(el => { const r = el.getBoundingClientRect(); if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) return false; const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return hit && !el.contains(hit) && !hit.contains(el) }).map(el => (el.getAttribute('aria-label') || el.textContent).trim().slice(0,40) + ' under ' + document.elementFromPoint(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2, el.getBoundingClientRect().y + el.getBoundingClientRect().height/2).className)`)
      const scroll = await page.eval('({sw: document.documentElement.scrollWidth, vw: innerWidth})')
      report.push({ tag, covered, hscroll: scroll.sw > scroll.vw, failed: page.failed.length })
    }
  }
  page.close()
}
console.log(JSON.stringify(report, null, 0))
browser.close(); process.exit(0)
