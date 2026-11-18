// A small Chrome DevTools Protocol client for a headless Comet started by the
// caller. Used by scripts/capture-house.mjs (screenshots) and
// scripts/live-acceptance.mjs (the live Crew walk). No dependency: bun's own
// fetch and WebSocket.
//
//   const browser = await connect(9333)
//   const page = await browser.newPage()
//   await page.size(1280, 720)
//   await page.go('http://127.0.0.1:8765/')
//   await page.until('document.querySelector("[data-gate-screen]") !== null')
//   await page.shot('gate.png')

import { writeFileSync } from 'node:fs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Waits for the DevTools endpoint on `port`, then opens a browser-level session. */
export async function connect(port, { timeoutMs = 20_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let version = null
  while (version === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) version = await response.json()
    } catch {
      if (Date.now() > deadline) throw new Error(`No DevTools endpoint on port ${port}.`)
      await sleep(250)
    }
  }
  const session = await open(version.webSocketDebuggerUrl)
  return {
    async newPage() {
      const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' })
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const target = list.find((item) => item.id === targetId)
      return page(await open(target.webSocketDebuggerUrl))
    },
    close: () => session.close(),
  }
}

async function open(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = () => reject(new Error('DevTools socket failed to open.'))
  })
  let next = 0
  const waiting = new Map()
  const listeners = new Set()
  socket.onmessage = (message) => {
    const data = JSON.parse(String(message.data))
    if (data.id !== undefined && waiting.has(data.id)) {
      const { resolve, reject } = waiting.get(data.id)
      waiting.delete(data.id)
      if (data.error) reject(new Error(`${data.error.message}`))
      else resolve(data.result)
    } else if (data.method) {
      for (const listener of listeners) listener(data)
    }
  }
  return {
    send(method, params = {}) {
      next += 1
      const id = next
      socket.send(JSON.stringify({ id, method, params }))
      return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }))
    },
    on(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => socket.close(),
  }
}

function page(session) {
  const failed = []
  const consoleErrors = []
  session.on((event) => {
    if (event.method === 'Network.responseReceived' && event.params.response.status >= 400) {
      failed.push({ status: event.params.response.status, url: event.params.response.url })
    }
    if (event.method === 'Network.loadingFailed' && !event.params.canceled) failed.push({ status: 0, url: event.params.requestId })
    if (event.method === 'Runtime.exceptionThrown') consoleErrors.push(event.params.exceptionDetails.text)
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
      consoleErrors.push(event.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
    }
  })
  const ready = Promise.all([session.send('Page.enable'), session.send('Runtime.enable'), session.send('Network.enable')])

  const api = {
    /** Requests that answered 4xx/5xx or failed to load, since the page opened. */
    failed,
    consoleErrors,
    async size(width, height) {
      await ready
      await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 })
    },
    /** prefers-color-scheme and prefers-reduced-motion. */
    async media({ scheme = 'light', reducedMotion = 'no-preference' } = {}) {
      await ready
      await session.send('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: scheme },
          { name: 'prefers-reduced-motion', value: reducedMotion },
        ],
      })
    },
    async go(url) {
      await ready
      await session.send('Page.navigate', { url })
      await api.until('document.readyState === "complete"')
    },
    async eval(expression) {
      await ready
      const result = await session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) throw new Error(`eval failed: ${result.exceptionDetails.text} in ${expression.slice(0, 120)}`)
      return result.result.value
    },
    /** Polls an expression until it is truthy. */
    async until(expression, { timeoutMs = 15_000, everyMs = 100 } = {}) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        let value = null
        try {
          value = await api.eval(`(() => { const v = (${expression}); return v instanceof Node ? true : v })()`)
        } catch {
          value = null
        }
        if (value) return value
        if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${expression.slice(0, 160)}`)
        await sleep(everyMs)
      }
    },
    /** Clicks the first element matching a selector, by its centre, as a pointer would. */
    async click(selector) {
      const box = await api.until(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({block: 'center'}); const r = el.getBoundingClientRect(); return r.width > 0 ? {x: r.x + r.width / 2, y: r.y + r.height / 2} : null })()`,
      )
      for (const type of ['mousePressed', 'mouseReleased']) {
        await session.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
      }
    },
    async key(key, { code = key, text, keyCode } = {}) {
      const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
      await session.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text })
      await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    },
    async type(text) {
      await session.send('Input.insertText', { text })
    },
    async shot(path) {
      await ready
      const { data } = await session.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(path, Buffer.from(data, 'base64'))
    },
    async pause(ms) {
      await sleep(ms)
    },
    close: () => session.close(),
  }
  return api
}
