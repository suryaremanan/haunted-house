// @vitest-environment node
// Submission asset checks (replay-and-submission task 9.6).
// Runs the real capture plan and the real asset scanner on the repository.
// No browser starts, no file is written and no request leaves the machine.
// **Validates: Requirements 9.6, 9.7, 10.1, 10.2, 10.5, 10.6**
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const CAPTURE = path.join(REPO_ROOT, 'scripts/capture-submission-assets.mjs')
const CHECK_ASSETS = path.join(REPO_ROOT, 'scripts/check-assets.py')
const SPIKE_RESULT = path.join(REPO_ROOT, 'spikes/fixtures/replay-media-capture.json')

const run = (command: string, args: string[]) =>
  spawnSync(command, args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 })

interface Capture {
  id: string
  kind: string
  required: boolean
  path: string
  viewport: { width: number; height: number }
  theme: string
  altText: string
  command: string
}

const plan = () => {
  const result = run(process.execPath, [CAPTURE, '--plan'])
  expect(result.status).toBe(0)
  return { text: result.stdout, data: JSON.parse(result.stdout) as { status: string; fixture: { path: string; sha256: string }; captures: Capture[] } }
}

const sourceFiles = (folder: string): string[] =>
  readdirSync(folder).flatMap((name) => {
    const full = path.join(folder, name)
    if (statSync(full).isDirectory()) return name === 'test' ? [] : sourceFiles(full)
    return /\.(ts|tsx|css|html|svg)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })

describe('capture plan', () => {
  it('is deterministic and ties every capture to the committed fixture', () => {
    const first = plan()
    const second = plan()
    expect(second.text).toBe(first.text)
    const digest = createHash('sha256').update(readFileSync(path.join(REPO_ROOT, first.data.fixture.path))).digest('hex')
    expect(first.data.fixture.sha256).toBe(digest)
  })

  it('plans light, dark, replay and approval screenshots with size, theme and alt text', () => {
    const { captures } = plan().data
    const required = captures.filter((capture) => capture.required)
    expect(required.map((capture) => capture.id).sort()).toEqual(['attic-replay', 'door-approval', 'house-dark', 'house-light'])
    expect(new Set(required.map((capture) => capture.theme))).toEqual(new Set(['light', 'dark']))
    expect(new Set(captures.map((capture) => capture.path)).size).toBe(captures.length)
    for (const capture of captures) {
      expect(capture.path).toMatch(/^(docs\/screenshots|app\/assets)\/[a-z0-9-]+\.png$/)
      expect(capture.viewport.width).toBeGreaterThanOrEqual(1200)
      expect(capture.viewport.height).toBeGreaterThanOrEqual(675)
      expect(capture.altText.length).toBeGreaterThan(20)
      expect(capture.command).toContain('scripts/capture-submission-assets.mjs')
    }
  })

  it('holds no local path, URL or credential-shaped text', () => {
    const { text } = plan()
    expect(text).not.toMatch(/https?:\/\//)
    expect(text).not.toMatch(/\/(Users|home)\//)
    expect(text).not.toMatch(/token|secret/i)
  })

  it('fails closed while the RS-S3 result is absent, and writes no screenshot', () => {
    if (existsSync(SPIKE_RESULT)) return // a passing spike result enables the real capture
    const result = run(process.execPath, [CAPTURE])
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).toContain('capture_unavailable')
    for (const capture of plan().data.captures) {
      // A planned file exists only if a real capture produced it and the manifest records it.
      if (existsSync(path.join(REPO_ROOT, capture.path))) {
        const manifest = readFileSync(path.join(REPO_ROOT, 'docs/assets-manifest.json'), 'utf8')
        expect(manifest).toContain(capture.path)
      }
    }
  })

  it('rejects an unknown option', () => {
    expect(run(process.execPath, [CAPTURE, '--unknown']).status).toBe(2)
  })

  it('imports no browser package and no process or network module', () => {
    const source = readFileSync(CAPTURE, 'utf8')
    for (const forbidden of ['playwright', 'puppeteer', 'selenium', 'child_process', 'node:http', 'node:https', 'node:net', 'fetch(', 'writeFile']) {
      expect(source).not.toContain(forbidden)
    }
  })
})

describe('asset scanner on the repository', () => {
  it('accepts the committed manifest, media files, UI source and bundle', () => {
    const result = run('python3', [CHECK_ASSETS])
    expect(result.stdout + result.stderr).toContain('check-assets:')
    expect(result.status).toBe(0)
  })
})

describe('MVP has no sound', () => {
  const files = [...sourceFiles(path.join(REPO_ROOT, 'app/ui/src')), ...sourceFiles(path.join(REPO_ROOT, 'app/ui/replay'))]
  const bundle = readFileSync(path.join(REPO_ROOT, 'app/ui/dist/index.mjs'), 'utf8')

  it('ships no audio file', () => {
    const media = (folder: string): string[] =>
      existsSync(folder)
        ? readdirSync(folder).flatMap((name) => {
            const full = path.join(folder, name)
            if (name === 'node_modules' || name === 'dist-replay') return []
            return statSync(full).isDirectory() ? media(full) : [full]
          })
        : []
    const audio = [...media(path.join(REPO_ROOT, 'app')), ...media(path.join(REPO_ROOT, 'docs'))].filter((file) =>
      /\.(mp3|ogg|oga|wav|flac|m4a|aac|opus|midi?)$/i.test(file),
    )
    expect(audio).toEqual([])
  })

  it('uses no audio API in the UI source or the committed bundle', () => {
    expect(files.length).toBeGreaterThan(10)
    const audioApi = /\bnew\s+Audio\s*\(|AudioContext|<audio\b|speechSynthesis|\.(mp3|ogg|wav)['"`]/
    for (const file of files) {
      expect(audioApi.test(readFileSync(file, 'utf8')), path.relative(REPO_ROOT, file)).toBe(false)
    }
    expect(audioApi.test(bundle)).toBe(false)
  })

  it('loads no remote image, font, style or media in the UI source or bundle', () => {
    const remote = /(?:src|href|url)\s*[=(:]\s*['"`(]?\s*(?:https?:)?\/\/[^\s'"`)]+\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf|otf|css|mp4|webm)/i
    for (const file of files) {
      expect(remote.test(readFileSync(file, 'utf8')), path.relative(REPO_ROOT, file)).toBe(false)
    }
    expect(remote.test(bundle)).toBe(false)
  })
})
