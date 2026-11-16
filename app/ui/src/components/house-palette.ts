// Fallback House Palette (Spec 6, Requirements 5.5 to 5.7): the semantic colors
// the house uses when a Crew theme variable is absent, as data, so every
// functional pair can be checked against WCAG 2.2 AA by calculation.
//
// Light is candlelit parchment; dark is dusk plum and ink. Color is only ever
// an accent here: state is carried by words, icons, poses, shapes and borders.
// Pure data and arithmetic. No React, DOM, SDK, network, or clock.

export type ThemeMode = 'light' | 'dark'

export interface HousePalette {
  /** The page behind the house. */
  readonly canvas: string
  /** Room and panel background. */
  readonly surface: string
  /** Controls and cards raised above a surface. */
  readonly surfaceRaised: string
  readonly text: string
  readonly textMuted: string
  /** Component boundaries: room walls, control outlines, door frames. */
  readonly border: string
  /** Focus ring. */
  readonly focus: string
  /** Warm candle accent for attention cues and the primary control fill. */
  readonly accent: string
  /** Text placed on an `accent` fill. */
  readonly accentText: string
  /** Failed and rejected cues. */
  readonly danger: string
  /** Open and done cues. */
  readonly ok: string
  /** Candle flame in the art. */
  readonly candle: string
  /** Ghost outline in the art, and the idle ghost. */
  readonly ghost: string
  /** A ghost at work: its drawing and its state word. */
  readonly working: string
}

export const PALETTE_TOKENS = [
  'canvas',
  'surface',
  'surfaceRaised',
  'text',
  'textMuted',
  'border',
  'focus',
  'accent',
  'accentText',
  'danger',
  'ok',
  'candle',
  'ghost',
  'working',
] as const satisfies readonly (keyof HousePalette)[]

export const HOUSE_PALETTES: Readonly<Record<ThemeMode, HousePalette>> = {
  light: {
    canvas: '#f6ecd6',
    surface: '#fff8e8',
    surfaceRaised: '#fffdf6',
    text: '#241b17',
    textMuted: '#5b4a40',
    border: '#7a6452',
    focus: '#005fcc',
    accent: '#8a4b12',
    accentText: '#fffdf6',
    danger: '#a3261c',
    ok: '#2d6a3e',
    candle: '#9a5a00',
    ghost: '#5d4f86',
    working: '#1d5b86',
  },
  dark: {
    canvas: '#17121c',
    surface: '#211a29',
    surfaceRaised: '#2c2336',
    text: '#f3eadb',
    textMuted: '#c9bcae',
    border: '#9a8aa6',
    focus: '#8ec5ff',
    accent: '#f0b35a',
    accentText: '#1d1408',
    danger: '#ff9a8c',
    ok: '#8fd6a0',
    candle: '#ffc56b',
    ghost: '#d9d0ee',
    working: '#8cc8f0',
  },
}

export interface ContrastPair {
  readonly foreground: keyof HousePalette
  readonly background: keyof HousePalette
  /** 4.5 for normal text (WCAG 1.4.3); 3 for component boundaries, focus and state cues (1.4.11). */
  readonly minimum: 3 | 4.5
}

const BACKGROUNDS = ['canvas', 'surface', 'surfaceRaised'] as const

function onEveryBackground(foreground: keyof HousePalette, minimum: 3 | 4.5): ContrastPair[] {
  return BACKGROUNDS.map((background) => ({ foreground, background, minimum }))
}

/**
 * Every functional pair the house styles use. Text tokens are held to 4.5:1
 * on each background they sit on. The accent, danger and ok tokens also color
 * small state words, so they are held to the text threshold too. Boundaries,
 * the focus ring and the art's outlines are held to 3:1.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...onEveryBackground('text', 4.5),
  ...onEveryBackground('textMuted', 4.5),
  ...onEveryBackground('accent', 4.5),
  ...onEveryBackground('danger', 4.5),
  ...onEveryBackground('ok', 4.5),
  ...onEveryBackground('working', 4.5),
  { foreground: 'accentText', background: 'accent', minimum: 4.5 },
  ...onEveryBackground('border', 3),
  ...onEveryBackground('focus', 3),
  ...onEveryBackground('candle', 3),
  ...onEveryBackground('ghost', 3),
  // The focus ring is always drawn with an outline offset, so the color next
  // to it is the background around the control, never the control's own fill.
]

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a `#rrggbb` color. Throws on any other form. */
export function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error('expected a #rrggbb color')
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
}

/** WCAG contrast ratio of two `#rrggbb` colors, from 1 to 21. Order does not matter. */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/** `surfaceRaised` becomes `--hh-fb-surface-raised`. */
export function fallbackVariableName(token: keyof HousePalette): string {
  return `--hh-fb-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
}

/** The fallback declarations of one mode, one `--hh-fb-*: #rrggbb;` per token. */
export function paletteCssVariables(mode: ThemeMode): string {
  const palette = HOUSE_PALETTES[mode]
  return PALETTE_TOKENS.map((token) => `${fallbackVariableName(token)}: ${palette[token]};`).join(' ')
}
