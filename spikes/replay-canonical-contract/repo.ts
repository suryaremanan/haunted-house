// Repository reader for the RS-S0 probe: the fixtures and the source text the
// structural checks look at. Read-only; used by run.ts and by the UI test.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProbeInputs, Seams } from './probe'

export const REPO = fileURLToPath(new URL('../../', import.meta.url))
export const readRepoFile = (relative: string): string => readFileSync(path.join(REPO, relative), 'utf8')

/** Source files under `folder`, repo-relative path -> text. Tests and test support are left out. */
export function sources(folder: string, extensions: readonly string[]): Record<string, string> {
  const found: Record<string, string> = {}
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(REPO, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (!/^(?:test|tests|__pycache__|node_modules)$/.test(entry.name)) walk(child)
      } else if (entry.isFile() && extensions.some((extension) => child.endsWith(extension)) && !/\.test\.|test-setup/.test(child)) {
        found[child] = readRepoFile(child)
      }
    }
  }
  walk(folder)
  return found
}

export function readInputs(seams: Seams): ProbeInputs {
  return {
    seams,
    log: readRepoFile('fixtures/replay/demo.jsonl'),
    backendSteps: JSON.parse(readRepoFile('fixtures/replay/demo.workflow.json')),
    backendFinal: JSON.parse(readRepoFile('fixtures/replay/demo.expected.json')),
    uiSources: sources('app/ui/src', ['.ts', '.tsx']),
    backendSources: sources('app/backend/haunted_house', ['.py']),
  }
}
