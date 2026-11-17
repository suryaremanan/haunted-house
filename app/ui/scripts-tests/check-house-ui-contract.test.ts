// @vitest-environment node
// Source, CSS, bundle and MVP-scope contract of the House UI (Spec 6 task
// 8.4). Static checks over what is shipped: the UI sources, the CSS strings,
// the app manifest and the committed bundle. They guard the things a visual
// change could remove without any test of behaviour noticing.
// **Validates: Requirements 1.10, 5.1, 5.2, 5.6, 5.7, 5.9, 7.5, 7.6, 7.7, 8.11, 10.7, 10.8, 11.1, 11.5, 11.7**
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HOUSE_PALETTES, CONTRAST_PAIRS, contrastRatio } from '../src/components/house-palette'
import { HOUSE_UI_STYLES } from '../src/components/house-styles'
import { ROOM_OUTPUT_STYLES } from '../src/components/room-output-styles'
import { MIN_MOTION_CYCLE_SECONDS } from '../src/core/motion-policy'
import { ATTIC_STYLES } from '../src/rooms/attic/attic-styles'
import { FOYER_STYLES } from '../src/rooms/foyer/foyer-styles'
import { HOUSE_SEANCE_ROOM } from '../src/rooms/house/House'
import { HOUSE_PANEL_STYLES } from '../src/rooms/house/panel-styles'
import { HOST_MODULES } from '../vite.config'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const UI = path.join(HERE, '..')
const SRC = path.join(UI, 'src')
const REPO = path.join(UI, '../..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    return statSync(file).isDirectory() ? walk(file) : [file]
  })
}

const isTest = (file: string) => /\.test\.tsx?$|[/\\]test[/\\]|-test-kit\.tsx?$|test-setup\.ts$/.test(file)
/** Shipped sources: everything under src/ that is not a test, a test kit or a declaration. */
const SHIPPED = walk(SRC).filter((file) => /\.tsx?$/.test(file) && !isTest(file) && !file.endsWith('.d.ts'))
const relative = (file: string) => path.relative(UI, file)
const read = (file: string) => readFileSync(file, 'utf8')
/** Source with comments removed, so a rule named in prose does not count as a use. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const offenders = (pattern: RegExp, files = SHIPPED) => files.filter((file) => pattern.test(code(read(file)))).map(relative)

const SHEETS: Readonly<Record<string, string>> = {
  'house-styles': HOUSE_UI_STYLES,
  'panel-styles': HOUSE_PANEL_STYLES,
  'room-output-styles': ROOM_OUTPUT_STYLES,
  'foyer-styles': FOYER_STYLES,
  'attic-styles': ATTIC_STYLES,
}

describe('scan', () => {
  it('covers the shell, the map, the panels, the adapters and the rooms', () => {
    const files = SHIPPED.map(relative)
    expect(files.length).toBeGreaterThan(60)
    expect(files).toEqual(
      expect.arrayContaining([
        'src/App.tsx',
        'src/components/MansionShell.tsx',
        'src/components/HouseMap.tsx',
        'src/components/RoomHotspots.tsx',
        'src/components/RoomPanelHost.tsx',
        'src/components/house-art.tsx',
        'src/adapters/host-effects.ts',
        'src/adapters/house-projection.ts',
        'src/rooms/house/House.tsx',
      ]),
    )
    expect(files.filter((file) => /\.test\./.test(file))).toEqual([])
  })
})

describe('plain CSS in one module', () => {
  it('has no Tailwind dependency, directive, config or runtime import', () => {
    const manifest = JSON.parse(read(path.join(UI, 'package.json'))) as Record<string, Record<string, string> | undefined>
    const packages = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies })
    expect(packages.filter((name) => /tailwind|postcss|autoprefixer/.test(name))).toEqual([])
    expect(readdirSync(UI).filter((name) => /^(tailwind|postcss)\.config\./.test(name))).toEqual([])
    expect(offenders(/@tailwind\b|@apply\b|from ['"]tailwindcss|tailwind-merge|\btwMerge\b/)).toEqual([])
    for (const [name, css] of Object.entries(SHEETS)) expect(css, name).not.toMatch(/@tailwind|@apply|@import/)
  })

  it('ships no stylesheet beside the module: no CSS file and no CSS import', () => {
    expect(walk(SRC).filter((file) => /\.(css|scss|sass|less)$/.test(file)).map(relative)).toEqual([])
    expect(offenders(/import\s+[^;]*['"][^'"]+\.(css|scss|sass|less)['"]/)).toEqual([])
    if (existsSync(path.join(UI, 'dist'))) {
      expect(readdirSync(path.join(UI, 'dist')).filter((name) => !name.endsWith('.mjs'))).toEqual([])
    }
  })
})

describe('original art, nothing remote', () => {
  it('loads no remote or embedded third-party asset in any source or sheet', () => {
    // What draws the house: the components, the rooms and the page. (core/ holds redaction
    // patterns that name URL schemes; it renders nothing.) Comments are stripped first.
    const drawn = SHIPPED.filter((file) => /[/\\](components|rooms)[/\\]|App\.tsx$/.test(file))
    expect(drawn.length).toBeGreaterThan(30)
    expect(offenders(/https?:\/\/(?!www\.w3\.org\/)/, drawn)).toEqual([])
    expect(offenders(/data:(image|audio|video|font)\//, drawn)).toEqual([])
    expect(offenders(/<image\b|<img\b|<picture\b|<video\b|<iframe\b|<object\b|<embed\b|xlink:href|<use\b/, drawn)).toEqual([])
    for (const [name, css] of Object.entries(SHEETS)) {
      expect(css, name).not.toMatch(/url\(/)
      expect(css, name).not.toMatch(/@font-face|@import/)
    }
  })

  it('names no third-party product or character', () => {
    expect(offenders(/\bMicrosoft\b|\bClippy\b|\bRover\b|Utopia|\bBob\b/)).toEqual([])
  })

  it('keeps every drawing decorative: one wrapper that hides it and no animation element', () => {
    const art = code(read(path.join(SRC, 'components/house-art.tsx')))
    expect(art.match(/<svg\b/g)).toHaveLength(1)
    expect(art).toMatch(/aria-hidden="true"/)
    expect(art).toMatch(/focusable="false"/)
    expect(art).not.toMatch(/<animate|<set\b|<script|<title|<desc|<a\b|onClick|tabIndex/)
  })
})

describe('motion', () => {
  it('has no parallax, shake, perspective, pointer tracking or scroll-linked effect', () => {
    for (const [name, css] of Object.entries(SHEETS)) {
      expect(css, name).not.toMatch(/perspective|rotate3d|translate3d|translateZ|parallax|shake|background-attachment:\s*fixed|scroll-timeline|animation-timeline|view-timeline/i)
    }
    expect(offenders(/mousemove|pointermove|onMouseMove|onPointerMove|deviceorientation|devicemotion|requestAnimationFrame|scrollY|onScroll\b|addEventListener\(['"]scroll/)).toEqual([])
    // No animation is started from script either.
    expect(offenders(/\.animate\(|setInterval\(/)).toEqual([])
  })

  it('runs every animation for at least two seconds per cycle and only where motion is allowed', () => {
    for (const [name, css] of Object.entries(SHEETS)) {
      for (const [declaration, value] of css.matchAll(/animation:\s*([^;}]+)/g)) {
        if (/^none\b/.test(value.trim())) continue
        const seconds = Array.from(value.matchAll(/(\d*\.?\d+)(ms|s)\b/g), ([, amount, unit]) => (unit === 'ms' ? Number(amount) / 1000 : Number(amount)))
        expect(seconds.length, `${name}: ${declaration}`).toBeGreaterThan(0)
        // The first time is the duration.
        expect(seconds[0], `${name}: ${declaration}`).toBeGreaterThanOrEqual(MIN_MOTION_CYCLE_SECONDS)
        expect(value, `${name}: ${declaration}`).not.toMatch(/steps\(/)
      }
      // Every running animation sits inside the no-preference media query.
      const outside = css.split('@media (prefers-reduced-motion: no-preference)')[0]
      expect(outside.match(/animation:\s*(?!none)[^;}]+/g) ?? [], name).toEqual([])
      // Transitions, where a sheet has any, are also inside a motion gate or switched off.
      expect(outside.match(/transition:\s*(?!none)[^;}]+/g) ?? [], name).toEqual([])
    }
  })

  it('gates the house sheet on both the shell setting and the browser preference', () => {
    expect(HOUSE_UI_STYLES).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{[^@]*\.hh-ui\[data-motion='low-frequency'\]/)
    expect(HOUSE_UI_STYLES).toContain("@media (prefers-reduced-motion: reduce)")
    expect(HOUSE_UI_STYLES).toMatch(/\.hh-ui\[data-motion='none'\][^{]*\{ animation: none !important; transition: none !important; \}/)
    expect(HOUSE_PANEL_STYLES).toContain("[data-motion='low-frequency'] .hh-spin")
  })

  it('flashes nothing: every keyframe set changes opacity or position at most twice per cycle', () => {
    for (const [name, css] of Object.entries(SHEETS)) {
      for (const [, frames] of css.matchAll(/@keyframes [\w-]+ \{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
        expect(Array.from(frames.matchAll(/\{[^{}]*\}/g)).length, name).toBeLessThanOrEqual(3)
      }
    }
  })
})

describe('reflow contract in the sheet', () => {
  it('has the wide and linear breakpoints, wraps long text and fixes no width', () => {
    expect(HOUSE_UI_STYLES).toContain('@media (min-width: 900px)')
    expect(HOUSE_UI_STYLES).toContain('@media (max-width: 640px)')
    expect(HOUSE_UI_STYLES).toMatch(/overflow-wrap: anywhere/)
    expect(HOUSE_UI_STYLES).toMatch(/\.hh-ui-panel \{[^}]*width: min\(42rem, 100%\)/)
    for (const sheet of [HOUSE_UI_STYLES, HOUSE_PANEL_STYLES]) {
      // No fixed pixel width or min-width above the 320px target, and no clipped text.
      for (const [, pixels] of sheet.matchAll(/(?:^|[\s;{])(?:min-)?width:\s*(\d+)px/g)) expect(Number(pixels)).toBeLessThanOrEqual(1)
      expect(sheet).not.toMatch(/text-overflow:\s*ellipsis/)
      // Only visually hidden text (the live region, and words kept for assistive technology) may clip or refuse to wrap.
      for (const [rule, body] of sheet.matchAll(/[^{}]+\{([^{}]*)\}/g)) {
        if (/white-space:\s*nowrap|overflow(-x)?:\s*hidden/.test(body)) expect(rule).toMatch(/\.hh-ui-(?:announcer|visually-hidden) \{/)
      }
    }
    // Rooms are placed by grid area only, so the order of the list never changes.
    expect(HOUSE_UI_STYLES).not.toMatch(/(^|[\s;{])order:|flex-direction:\s*(row|column)-reverse|direction:\s*rtl/)
  })

  it('keeps every fallback contrast pair at or above its WCAG 2.2 AA minimum', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const pair of CONTRAST_PAIRS) {
        const ratio = contrastRatio(HOUSE_PALETTES[mode][pair.foreground], HOUSE_PALETTES[mode][pair.background])
        expect(ratio, `${mode} ${pair.foreground} on ${pair.background}`).toBeGreaterThanOrEqual(pair.minimum)
      }
    }
  })
})

describe('MVP scope', () => {
  it('makes sound only by synthesis, in one adapter, behind one control', () => {
    // No sample, element, speech or vibration anywhere; the Web Audio API only in the Sound Feature's adapter.
    expect(offenders(/new Audio\b|<audio\b|speechSynthesis|SpeechSynthesisUtterance|\.(mp3|ogg|wav|m4a|flac)\b|navigator\.vibrate/)).toEqual([])
    expect(offenders(/AudioContext|webkitAudioContext/)).toEqual(['src/adapters/house-sound.ts'])
    expect(walk(path.join(UI, 'src')).filter((file) => /\.(mp3|ogg|wav|m4a|flac)$/.test(file)).map(relative)).toEqual([])
    expect(existsSync(path.join(SRC, 'stretch'))).toBe(false)
    // The one sound control is the toolbar's toggle.
    expect(offenders(/\b[Ss]ound\b|\b[Mm]ute\b/, SHIPPED.filter((file) => /\.tsx$/.test(file))).sort()).toEqual([
      'src/components/HouseToolbar.tsx',
      'src/components/MansionShell.tsx',
    ])
  })

  it('has no chat composer: the only text field in a Mansion is the bounded revision request', () => {
    const fields = offenders(/<textarea\b|<input\b|contentEditable/)
    expect(fields.sort()).toEqual(
      ['src/rooms/foyer/CreateMansionForm.tsx', 'src/rooms/foyer/MansionList.tsx', 'src/rooms/house/RevisionRequest.tsx', 'src/rooms/workshop/WorkshopTaskBoard.tsx', 'src/rooms/attic/ReplayControls.tsx', 'src/rooms/attic/ReplayBar.tsx']
        .filter((file) => fields.includes(file))
        .sort(),
    )
    expect(fields).toContain('src/rooms/house/RevisionRequest.tsx')
    // The shell, the map and the panel host have none at all.
    expect(fields.filter((file) => file.startsWith('src/components/'))).toEqual([])
    expect(offenders(/openChat\(\s*\)|autoSend|\?new=1/)).toEqual([])
  })

  it('ships the Séance Room locked, with no review mutation', () => {
    expect(HOUSE_SEANCE_ROOM).toBe('locked')
    const seance = SHIPPED.filter((file) => file.includes(`${path.sep}seance-room${path.sep}`))
    expect(seance.length).toBeGreaterThanOrEqual(3)
    expect(offenders(/onSend|onRoomSend|api\.post|\.post\(/, seance)).toEqual([])
  })

  it('adds no API path to the manifest', () => {
    const manifest = JSON.parse(read(path.join(REPO, 'app/app.json'))) as { permissions: { api: string[] }; ui: { entry: string } }
    expect(manifest.permissions.api).toEqual(['/api/version', '/api/chat', '/api/chat/*', '/apps/haunted-house/api/*'])
    expect(manifest.ui.entry).toBe('dist/index.mjs')
  })

  it('keeps host hooks behind the adapter: no component imports the SDK', () => {
    expect(offenders(/@kirocrew\/app-sdk/).sort()).toEqual(['src/adapters/sdk.ts'])
  })
})

describe('committed bundle', () => {
  const bundle = path.join(UI, 'dist/index.mjs')

  it('imports only the modules the host supplies', () => {
    const source = read(bundle)
    const bare = Array.from(source.matchAll(/(?:from|import)\s*["']([^"'./][^"']*)["']/g), (match) => match[1])
    expect(bare.length).toBeGreaterThan(0)
    for (const specifier of new Set(bare)) {
      expect(HOST_MODULES.some((allowed) => (typeof allowed === 'string' ? allowed === specifier : allowed.test(specifier))), specifier).toBe(true)
    }
  })

  it('carries no audio sample, no remote asset, no Tailwind and no stretch code', () => {
    const source = read(bundle)
    expect(source).not.toMatch(/new Audio\b|<audio\b|speechSynthesis|\.(mp3|ogg|wav)\b/)
    expect(source).not.toMatch(/https?:\/\/(?!www\.w3\.org\/)/)
    expect(source).not.toMatch(/@tailwind|tailwindcss/)
    expect(source).not.toMatch(/url\(/)
    expect(source).not.toMatch(/\bfetch\(|new WebSocket|XMLHttpRequest|EventSource/)
  })
})
