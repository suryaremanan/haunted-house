// @vitest-environment node
// Tests for scripts/check-bundle-imports.mjs (Requirement 4.2): sample bundles
// are written to a temporary folder and the script runs on them with node.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HOST_MODULES } from '../vite.config'

const SCRIPT = fileURLToPath(new URL('../../../scripts/check-bundle-imports.mjs', import.meta.url))
const BUNDLE = 'dist/index.mjs'

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bundle-imports-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Writes files (paths relative to the temp root). `dist/index.mjs` is the bundle. */
function write(files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
}

/** Runs the checker from the temp root, so it reports paths like `dist/index.mjs`. */
function check(...args: string[]): { code: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' })
  return { code: result.status, out: result.stdout + result.stderr }
}

function checkBundle(source: string, extra: Record<string, string> = {}) {
  write({ [BUNDLE]: source, ...extra })
  return check(BUNDLE)
}

describe('check-bundle-imports.mjs', () => {
  it('passes a bundle that imports only host modules and its own chunks', () => {
    // Every module name the live build keeps external must pass the check.
    const hostNames = HOST_MODULES.filter((m): m is string => typeof m === 'string')
    const source = [
      ...hostNames.map((name, i) => `import * as m${i} from "${name}";`),
      'import { useAppApi } from "@kirocrew/app-sdk";',
      'export { useState } from "react";',
      'import { helper } from "./chunk-abc.js";',
      'console.log(import.meta.url, helper, useAppApi);',
    ].join('\n')
    const { code, out } = checkBundle(source, {
      'dist/chunk-abc.js': 'import { jsx } from "react/jsx-runtime";\nexport const helper = jsx;\n',
    })
    expect(out).toContain('imports only host modules (2 file(s) checked)')
    expect(code).toBe(0)
  })

  it.each([
    ['a dynamic import of a host module', 'const m = await import("react");'],
    ['an SDK subpath', 'import { Button } from "@kirocrew/app-sdk/ui";'],
  ])('allows %s', (_name, source) => {
    const { code, out } = checkBundle(source)
    expect(out).toContain('imports only host modules')
    expect(code).toBe(0)
  })

  it.each([
    ['an extra bare import', 'import x from "left-pad";', 'dist/index.mjs:1: left-pad (bare specifier'],
    ['export * from a bare module', 'import "react";\nexport * from "lodash";', 'dist/index.mjs:2: lodash (bare specifier'],
    ['a computed dynamic import', 'const m = await import(someVar);', 'dist/index.mjs:1: non-static dynamic import'],
    ['a remote URL', 'import "https://cdn/x.js";', 'dist/index.mjs:1: https://cdn/x.js (remote URL)'],
    ['a relative import that is missing', 'import "./chunk-gone.js";', './chunk-gone.js (relative import not found'],
  ])('reports %s', (_name, source, expected) => {
    const { code, out } = checkBundle(source)
    expect(out).toContain(expected)
    expect(code).toBe(1)
  })

  it('reports a relative import that leaves the bundle folder, even if the file exists', () => {
    const { code, out } = checkBundle('import "../outside.js";', { 'outside.js': 'export {};\n' })
    expect(out).toContain('dist/index.mjs:1: ../outside.js (relative import leaves the bundle folder)')
    expect(code).toBe(1)
  })

  it('checks the chunks a bundle imports', () => {
    const { code, out } = checkBundle('import "./chunk.js";', { 'dist/chunk.js': '\nimport pad from "left-pad";\n' })
    expect(out).toContain('dist/chunk.js:2: left-pad')
    expect(code).toBe(1)
  })

  it('exits 2 when the bundle is missing', () => {
    const { code, out } = check('dist/missing.mjs')
    expect(out).toContain('bundle not found: dist/missing.mjs')
    expect(code).toBe(2)
  })

  it('exits 2 when the bundle cannot be parsed', () => {
    const { code, out } = checkBundle('import { from "react";')
    expect(out).toContain('cannot parse dist/index.mjs')
    expect(code).toBe(2)
  })
})
