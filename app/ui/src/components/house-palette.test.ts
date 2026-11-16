// Fallback palette contrast (Spec 6 task 4.3; Requirements 5.5 to 5.7, 10.7):
// every functional pair is calculated with WCAG relative luminance.
import { describe, expect, it } from 'vitest'
import {
  CONTRAST_PAIRS,
  HOUSE_PALETTES,
  PALETTE_TOKENS,
  contrastRatio,
  fallbackVariableName,
  paletteCssVariables,
  relativeLuminance,
  type HousePalette,
  type ThemeMode,
} from './house-palette'

const MODES: readonly ThemeMode[] = ['light', 'dark']

describe('WCAG arithmetic', () => {
  it('gives black on white the maximum ratio of 21', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10)
  })

  it('gives a color against itself a ratio of 1', () => {
    expect(contrastRatio('#7a6452', '#7a6452')).toBe(1)
  })

  it('matches published reference ratios', () => {
    // #767676 on white is the well-known 4.54:1 boundary gray.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    expect(contrastRatio('#0000ff', '#ffffff')).toBeCloseTo(8.59, 2)
  })

  it('refuses anything that is not #rrggbb', () => {
    for (const bad of ['#fff', 'red', 'rgb(0,0,0)', '#12345g', '']) {
      expect(() => relativeLuminance(bad)).toThrow()
    }
  })
})

describe('fallback palettes', () => {
  it('defines every token as #rrggbb in both modes', () => {
    for (const mode of MODES) {
      expect(Object.keys(HOUSE_PALETTES[mode]).sort()).toEqual([...PALETTE_TOKENS].sort())
      for (const token of PALETTE_TOKENS) expect(HOUSE_PALETTES[mode][token]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('is light in light mode and dark in dark mode', () => {
    expect(relativeLuminance(HOUSE_PALETTES.light.surface)).toBeGreaterThan(0.7)
    expect(relativeLuminance(HOUSE_PALETTES.dark.surface)).toBeLessThan(0.1)
  })

  for (const mode of MODES) {
    describe(`${mode} palette`, () => {
      for (const pair of CONTRAST_PAIRS) {
        it(`${pair.foreground} on ${pair.background} is at least ${pair.minimum}:1`, () => {
          const palette = HOUSE_PALETTES[mode]
          expect(contrastRatio(palette[pair.foreground], palette[pair.background])).toBeGreaterThanOrEqual(pair.minimum)
        })
      }
    })
  }
})

describe('contrast matrix', () => {
  const has = (foreground: keyof HousePalette, background: keyof HousePalette, minimum: number) =>
    CONTRAST_PAIRS.some((pair) => pair.foreground === foreground && pair.background === background && pair.minimum >= minimum)

  it('holds every text token to 4.5:1 on every background', () => {
    for (const background of ['canvas', 'surface', 'surfaceRaised'] as const) {
      for (const text of ['text', 'textMuted', 'accent', 'danger', 'ok', 'working'] as const) expect(has(text, background, 4.5)).toBe(true)
    }
    expect(has('accentText', 'accent', 4.5)).toBe(true)
  })

  it('holds boundaries, focus and art outlines to 3:1 on every background', () => {
    for (const background of ['canvas', 'surface', 'surfaceRaised'] as const) {
      for (const part of ['border', 'focus', 'candle', 'ghost'] as const) expect(has(part, background, 3)).toBe(true)
    }
  })

  it('names no pair twice and only real tokens', () => {
    const keys = CONTRAST_PAIRS.map((pair) => `${pair.foreground}/${pair.background}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const pair of CONTRAST_PAIRS) {
      expect(PALETTE_TOKENS).toContain(pair.foreground)
      expect(PALETTE_TOKENS).toContain(pair.background)
      expect([3, 4.5]).toContain(pair.minimum)
    }
  })

  it('covers every non-background token as a foreground', () => {
    const covered = new Set(CONTRAST_PAIRS.map((pair) => pair.foreground))
    for (const token of PALETTE_TOKENS) {
      if (token === 'canvas' || token === 'surface' || token === 'surfaceRaised') continue
      expect(covered.has(token)).toBe(true)
    }
  })
})

describe('fallback CSS variables', () => {
  it('names variables in kebab case', () => {
    expect(fallbackVariableName('surfaceRaised')).toBe('--hh-fb-surface-raised')
    expect(fallbackVariableName('text')).toBe('--hh-fb-text')
  })

  it('emits one declaration per token with the palette value', () => {
    for (const mode of MODES) {
      const css = paletteCssVariables(mode)
      for (const token of PALETTE_TOKENS) {
        expect(css).toContain(`${fallbackVariableName(token)}: ${HOUSE_PALETTES[mode][token]};`)
      }
      expect(css.match(/--hh-fb-/g)).toHaveLength(PALETTE_TOKENS.length)
    }
  })
})

describe('the static replay page', () => {
  it('paints the page behind the app in the palette canvas and text of each mode', async () => {
    const { default: html } = await import('../../replay/index.html?raw')
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
    const [light, dark] = style.split('@media (prefers-color-scheme: dark)')
    expect(light).toContain(`background: ${HOUSE_PALETTES.light.canvas};`)
    expect(light).toContain(`color: ${HOUSE_PALETTES.light.text};`)
    expect(dark).toContain(`background: ${HOUSE_PALETTES.dark.canvas};`)
    expect(dark).toContain(`color: ${HOUSE_PALETTES.dark.text};`)
  })
})
