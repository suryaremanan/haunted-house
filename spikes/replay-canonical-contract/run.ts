// Command-line adapter of the RS-S0 probe: reads the repository, runs
// `evaluate`, prints the scrubbed result. See probe.ts for usage.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { RESULT_PATH, evaluate, loadSeams, renderResult } from './probe'
import { REPO, readInputs, readRepoFile } from './repo'

const seams = await loadSeams((module) => import(`../../app/ui/src/${module}.ts`))
const rendered = renderResult(evaluate(readInputs(seams)))
const passed = JSON.parse(rendered).result === 'pass'
const mode = process.argv[2]

if (mode === '--write') {
  writeFileSync(path.join(REPO, RESULT_PATH), rendered)
  console.log(`wrote ${RESULT_PATH}`)
} else if (mode === '--check') {
  let recorded = ''
  try {
    recorded = readRepoFile(RESULT_PATH)
  } catch {
    // Reported below as a mismatch.
  }
  if (recorded !== rendered) {
    console.error(`RS-S0: ${RESULT_PATH} differs from a fresh probe; rerun with --write and review.`)
    process.exitCode = 1
  }
} else {
  process.stdout.write(rendered)
}
if (!passed) {
  console.error('RS-S0: contract_unavailable. Attic integration stays blocked.')
  process.exitCode = 1
}
