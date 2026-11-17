// Fallback House Palette (Spec 6, Requirements 5.5 to 5.7): the semantic colors
// the house uses when a Crew theme variable is absent, as data, so every
// functional pair can be checked against WCAG 2.2 AA by calculation.
//
// Light is drafting vellum and blue ink; dark is a night blueprint. Color is only ever
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
    canvas: '#e9eff9',
    surface: '#f5f8fe',
    surfaceRaised: '#ffffff',
    text: '#131d3a',
    textMuted: '#45547a',
    border: '#5a6a94',
    focus: '#0a54c9',
    accent: '#9c4700',
    accentText: '#ffffff',
    danger: '#ad2318',
    ok: '#1c6b43',
    candle: '#9a5a00',
    ghost: '#5b4b9a',
    working: '#125c8c',
  },
  dark: {
    canvas: '#0c1530',
    surface: '#141f3f',
    surfaceRaised: '#1d2a52',
    text: '#eef2ff',
    textMuted: '#bcc7e8',
    border: '#8c9bd0',
    focus: '#9cc8ff',
    accent: '#ffab4a',
    accentText: '#1c1204',
    danger: '#ff9c8f',
    ok: '#86e0ae',
    candle: '#ffc56b',
    ghost: '#d9d4ff',
    working: '#8fd0f5',
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

// ---------------------------------------------------------------------------
// The Scene Palette: the fixed colors of the 3D model and the sheet it stands
// on. Unlike the tokens above, these never read a Crew theme variable: the
// rooms are lamp-lit interiors and look the same in either theme; only the
// drafting sheet around them changes. Text is set on a scene color in two
// places only, both in `ink`: the Warden's `balloon` and the room's brass
// nameplate. Both pairs are far above 4.5:1 and are checked in the stage test.

export interface ScenePalette {
  /** The drafting sheet behind the model. */
  readonly sheet: string
  /** Its fine grid. */
  readonly sheetLine: string
  /** Dimension lines, the title block and the yard drawing. */
  readonly sheetInk: string
  /** Cut walls and floor slabs, filled solid as on a section drawing. */
  readonly poche: string
  /** Outlines inside the rooms. */
  readonly ink: string
  /** A ghost's sheet. */
  readonly bone: string
  /** The Warden's speech balloon. The one scene color that carries text, always in `ink`. */
  readonly balloon: string
  readonly moon: string
  /** Lamp and candle light. */
  readonly lamp: string
  /** The glow of a ghost at rest. */
  readonly ecto: string
  readonly wood: string
  readonly woodDark: string
  readonly floor: string
  readonly brass: string
  readonly cloth: string
  readonly paper: string
  readonly roof: string
  readonly wallFoyer: string
  readonly wallStudy: string
  readonly wallDrafting: string
  readonly wallWorkshop: string
  readonly wallAttic: string
  readonly wallSeance: string
  /** The night outside, from the top of the sky to the glow on the horizon. */
  readonly night1: string
  readonly night2: string
  readonly night3: string
  readonly night4: string
  readonly hill1: string
  readonly hill2: string
  readonly stone: string
  readonly tile: string
  readonly leather: string
  readonly frontDoor: string
  readonly iron: string
  /** A ghost's sheet in the painted rooms. */
  readonly spectre: string
}

const INTERIOR = {
  ink: '#1a1326',
  bone: '#f6eeda',
  balloon: '#fff6cc',
  moon: '#fff3c4',
  lamp: '#ffa63d',
  ecto: '#9dffcf',
  wood: '#8a5a34',
  woodDark: '#573620',
  floor: '#9c6b3f',
  brass: '#d9a441',
  cloth: '#b23a48',
  paper: '#e9f1ff',
  roof: '#3a2d52',
  wallFoyer: '#6a2f7a',
  wallStudy: '#2f6b4f',
  wallDrafting: '#1f6a82',
  wallWorkshop: '#8a4630',
  wallAttic: '#6b4a2b',
  wallSeance: '#472a86',
  night1: '#140f3a',
  night2: '#3b2470',
  night3: '#6a3a8c',
  night4: '#b0567a',
  hill1: '#1d1440',
  hill2: '#0c0820',
  stone: '#6f6a7c',
  tile: '#3b3552',
  leather: '#1f4a3a',
  frontDoor: '#5b1626',
  iron: '#17151d',
  spectre: '#eaf6ff',
} as const

export const SCENE_PALETTES: Readonly<Record<ThemeMode, ScenePalette>> = {
  light: { ...INTERIOR, sheet: '#d6e3f8', sheetLine: '#b4c8ec', sheetInk: '#355aa6', poche: '#1b2547' },
  dark: { ...INTERIOR, sheet: '#0d1838', sheetLine: '#1c3166', sheetInk: '#8fb3f5', poche: '#060a18' },
}

/** `wallFoyer` becomes `--hh-sc-wall-foyer`. */
export function sceneVariableName(token: keyof ScenePalette): string {
  return `--hh-sc-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
}

/** The scene declarations of one mode, one `--hh-sc-*: #rrggbb;` per token. */
export function sceneCssVariables(mode: ThemeMode): string {
  const palette = SCENE_PALETTES[mode]
  return (Object.keys(palette) as (keyof ScenePalette)[]).map((token) => `${sceneVariableName(token)}: ${palette[token]};`).join(' ')
}
