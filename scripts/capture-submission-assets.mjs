#!/usr/bin/env node
// Capture plan for the submission screenshots (Spec 7 task 9.4; Requirements
// 9.7, 10.1, 10.2, 10.6, 12.6).
//
// Usage:
//   node scripts/capture-submission-assets.mjs --plan
//       print the deterministic capture metadata as JSON and exit 0
//   node scripts/capture-submission-assets.mjs
//       capture the screenshots. This needs the browser runner proven by spike
//       RS-S3 (spikes/fixtures/replay-media-capture.json). Until that spike
//       result exists and says "pass", the command prints
//       `capture_unavailable` and exits 1.
//
// This script writes no file, starts no process, opens no socket and imports
// no browser package. It is a fail-closed gate: no screenshot may be claimed
// in docs/assets-checklist.md or docs/assets-manifest.json until a real
// capture ran. A jsdom layout is not screenshot evidence.
//
// Exit codes: 0 plan printed, 1 capture unavailable, 2 usage error.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = 'fixtures/replay/demo.jsonl'
const SPIKE_RESULT = 'spikes/fixtures/replay-media-capture.json'
const COMMAND = 'node scripts/capture-submission-assets.mjs'

// Crew's publishing guide recommends screenshots 1200 px wide at 16:9 and
// 1200x675 hero art. The video thumbnail uses the common 1280x720 frame.
const SCREENSHOT = { width: 1200, height: 675 }

/** Every planned capture. Required ones gate the asset checklist; optional ones do not. */
export const CAPTURES = [
  {
    id: 'house-light',
    kind: 'screenshot',
    required: true,
    path: 'docs/screenshots/house-light.png',
    viewport: SCREENSHOT,
    theme: 'light',
    state: 'Static replay at the final event with the House map visible.',
    altText:
      'Light theme: the Haunted House cutaway map with its rooms, doors and ghosts, each showing its state as text and an icon.',
  },
  {
    id: 'house-dark',
    kind: 'screenshot',
    required: true,
    path: 'docs/screenshots/house-dark.png',
    viewport: SCREENSHOT,
    theme: 'dark',
    state: 'Static replay at the final event with the House map visible.',
    altText:
      'Dark theme: the same Haunted House cutaway map with its rooms, doors and ghosts, each showing its state as text and an icon.',
  },
  {
    id: 'attic-replay',
    kind: 'screenshot',
    required: true,
    path: 'docs/screenshots/attic-replay.png',
    viewport: SCREENSHOT,
    theme: 'light',
    state: 'Attic open, replay paused at a middle event.',
    altText:
      'The Attic replay panel: play, pause, speed and seek controls above an ordered event timeline with the current event marked.',
  },
  {
    id: 'door-approval',
    kind: 'screenshot',
    required: true,
    path: 'docs/screenshots/door-approval.png',
    viewport: SCREENSHOT,
    theme: 'light',
    state: 'Replay paused at the approval request: a sealed door and a waiting ghost.',
    altText:
      'A sealed door waiting for approval: the room shows the waiting ghost, the requested action and the approve and deny choices.',
  },
  {
    id: 'hero-light',
    kind: 'hero',
    required: false,
    path: 'app/assets/hero-light.png',
    viewport: { width: 1200, height: 675 },
    theme: 'light',
    state: 'Static replay at the final event, House map only.',
    altText: 'The Haunted House cutaway drawing with friendly ghosts at work in their rooms.',
  },
  {
    id: 'video-thumbnail',
    kind: 'thumbnail',
    required: false,
    path: 'docs/screenshots/video-thumbnail.png',
    viewport: { width: 1280, height: 720 },
    theme: 'dark',
    state: 'Static replay at the final event, House map only.',
    altText: 'The Haunted House cutaway drawing in dark theme, used as the demo video thumbnail.',
  },
]

function fixtureDigest() {
  return createHash('sha256').update(readFileSync(path.join(REPO_ROOT, FIXTURE))).digest('hex')
}

/** Deterministic capture metadata: constants plus the digest of the committed fixture. */
export function capturePlan() {
  return {
    schemaVersion: 1,
    status: 'pending',
    gate: { spike: 'RS-S3', result: SPIKE_RESULT },
    fixture: { path: FIXTURE, sha256: fixtureDigest() },
    // Recorded by the capture run, never by the plan.
    sourceRevision: null,
    source: 'app/ui/dist-replay (static replay build; no external request)',
    captures: CAPTURES.map((capture) => ({ ...capture, command: `${COMMAND} --only ${capture.id}` })),
  }
}

/** `pass` only when the RS-S3 result file exists, parses and says so. */
export function gateStatus(file = path.join(REPO_ROOT, SPIKE_RESULT)) {
  if (!existsSync(file)) return 'missing'
  try {
    const result = JSON.parse(readFileSync(file, 'utf8'))
    const verdict = result?.result ?? result?.status
    return verdict === 'pass' ? 'pass' : 'not_passed'
  } catch {
    return 'unreadable'
  }
}

function main(argv) {
  const args = argv.slice(2)
  if (args.includes('--plan')) {
    if (args.length !== 1) {
      console.error('capture-submission-assets: --plan takes no other argument.')
      return 2
    }
    process.stdout.write(`${JSON.stringify(capturePlan(), null, 2)}\n`)
    return 0
  }
  const known = new Set(CAPTURES.map((capture) => capture.id))
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--only' && known.has(args[i + 1])) {
      i += 1
    } else {
      console.error('capture-submission-assets: usage: [--plan] | [--only <capture id>]')
      return 2
    }
  }
  const status = gateStatus()
  if (status !== 'pass') {
    console.error(
      `capture_unavailable: spike RS-S3 has no passing result (${SPIKE_RESULT}: ${status}). ` +
        'No screenshot was written. Run with --plan to see the planned captures.',
    )
    return 1
  }
  // RS-S3 names the development-only browser runner. Until that runner is
  // wired in here, a passing spike result alone still produces no capture.
  console.error(
    'capture_unavailable: RS-S3 passed, but its browser runner is not wired into this command. No screenshot was written.',
  )
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv)
}
