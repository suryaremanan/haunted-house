// The optional feature brief sent with mansion creation. The UI rule mirrors
// the backend's `normalize_mansion_brief` (core/mansion_requests.py).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MAX_MANSION_BRIEF_LENGTH, createMansionRequestBody, normalizeMansionBrief } from './mansion-api'

describe('normalizeMansionBrief', () => {
  it('normalises line endings and trims surrounding whitespace', () => {
    expect(normalizeMansionBrief('  A weather station.\r\nWith alerts.\t\n')).toEqual({
      ok: true,
      brief: 'A weather station.\nWith alerts.',
      length: 31,
    })
    expect(normalizeMansionBrief('a\rb')).toEqual({ ok: true, brief: 'a\nb', length: 3 })
  })

  it('treats a blank brief as no brief', () => {
    for (const blank of ['', '   ', '\n\t\r\n', '　 ']) {
      expect(normalizeMansionBrief(blank)).toEqual({ ok: true, brief: null, length: 0 })
    }
  })

  it('counts code points after trimming, like the backend', () => {
    const exact = '\u{1F47B}'.repeat(MAX_MANSION_BRIEF_LENGTH)
    expect(normalizeMansionBrief(`  ${exact}  `)).toEqual({ ok: true, brief: exact, length: 2000 })
    expect(normalizeMansionBrief('a'.repeat(2001))).toEqual({ ok: false, reason: 'too_long', length: 2001 })
  })

  it('keeps U+FEFF, which Python does not strip', () => {
    expect(normalizeMansionBrief('﻿x﻿')).toEqual({ ok: true, brief: '﻿x﻿', length: 3 })
  })

  it.each(['\u0000', '\u0007', '\u001b', '\u001c', '\u001f', '\u007f', '\u0085', '\u009f', '\ud800', '\udfff'])(
    'refuses control character or lone surrogate %j anywhere',
    (char) => {
      for (const text of [`ok${char}ok`, `${char}ok`, `ok${char}`]) {
        expect(normalizeMansionBrief(text)).toMatchObject({ ok: false, reason: 'invalid_characters' })
      }
    },
  )

  it('accepts paired surrogates and every printable code point', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 50 }), (text) => {
        const result = normalizeMansionBrief(text)
        const hasControl = [...text.replace(/\r\n?/g, '\n')].some((c) => {
          const code = c.codePointAt(0)!
          return code !== 9 && code !== 10 && (code <= 0x1f || (code >= 0x7f && code <= 0x9f))
        })
        expect(result.ok).toBe(!hasControl)
        if (result.ok && result.brief !== null) {
          expect(result.brief).not.toMatch(/^[ \t\n]|[ \t\n]$/)
          expect(result.length).toBe([...result.brief].length)
        }
      }),
    )
  })
})

describe('createMansionRequestBody', () => {
  it('sends exactly {name} without a non-blank brief', () => {
    expect(createMansionRequestBody('lab')).toEqual({ name: 'lab' })
    expect(Object.keys(createMansionRequestBody('lab', '  \n'))).toEqual(['name'])
  })

  it('sends the normalised brief', () => {
    expect(createMansionRequestBody('lab', ' Build it.\r\n')).toEqual({ name: 'lab', brief: 'Build it.' })
  })

  it('never builds a body the backend would refuse', () => {
    expect(() => createMansionRequestBody('lab', 'a\u0000')).toThrow(RangeError)
    expect(() => createMansionRequestBody('lab', 'a'.repeat(2001))).toThrow(RangeError)
  })
})
