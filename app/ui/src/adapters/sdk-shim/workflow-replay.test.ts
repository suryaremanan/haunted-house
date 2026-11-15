// The replay stand-in's workflow read route (Spec 4 task 15.1; Requirements 10.4 to 10.6).
import { describe, expect, it, vi } from 'vitest'
import demo from '../../../../../fixtures/replay/demo.jsonl?raw'
import demoWorkflow from '../../../../../fixtures/replay/demo.workflow.json'
import { parseWorkflowProjection } from '../../core/workflow-projection'
import { createSeanceReplayRoutes } from './seance-replay'
import { createWorkflowReplayRoutes } from './workflow-replay'

const PATH = '/apps/haunted-house/api/mansions/demo-mansion/workflow'

function routes(body: string = demo, elapsedMs = 10 * 60_000) {
  let now = 0
  const fetch = vi.fn(async () => new Response(body, { status: 200 }))
  const seance = createSeanceReplayRoutes({ fetch, now: () => now })
  return {
    fetch,
    workflow: createWorkflowReplayRoutes(seance),
    seance,
    /** Starts playback, then moves the clock. */
    async play() {
      await seance.presented('demo-mansion')
      now = elapsedMs
    },
  }
}

describe('workflow replay route', () => {
  it('answers only the workflow read route', () => {
    const { workflow, fetch } = routes()
    expect(workflow.get('/apps/haunted-house/api/mansions/demo-mansion/seance/events')).toBeNull()
    expect(workflow.get('/apps/haunted-house/api/mansions/demo-mansion/workflow/extra')).toBeNull()
    expect(workflow.get('/apps/haunted-house/api/whoami')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('serves the initial read-only projection before playback presents anything', async () => {
    const { workflow } = routes()
    const parsed = parseWorkflowProjection(await workflow.get(PATH), 'demo-mansion')
    // Playback has only just begun: at most the first record is presented, and it is not a Spec 4 fact.
    expect(parsed.ok && parsed.projection).toMatchObject({ readOnly: true, integrity: 'valid', riskyProposals: [] })
    expect(parsed.ok && parsed.projection.version).toBeLessThanOrEqual(1)
    expect(parsed.ok && parsed.projection.phases.map((phase) => phase.status)).toEqual(['ready', 'not_started', 'not_started', 'not_started'])
  })

  it('serves the backend projection of the whole recording once it has played, from one fetch', async () => {
    const { workflow, seance, fetch, play } = routes()
    await play()
    const body = (await workflow.get(PATH)) as Record<string, unknown>
    const expected = (demoWorkflow.steps as { workflow: Record<string, unknown> }[]).at(-1)!.workflow
    expect(body).toEqual({ ...expected, read_only: true })
    // The séance route and the workflow route share the one recording.
    await seance.get('/apps/haunted-house/api/mansions/demo-mansion/seance/events?after_sequence=0&limit=500')
    await workflow.get(PATH)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('serves an empty projection for a Mansion the recording does not hold', async () => {
    const { workflow, play } = routes()
    await play()
    const parsed = parseWorkflowProjection(await workflow.get('/apps/haunted-house/api/mansions/other-mansion/workflow'), 'other-mansion')
    expect(parsed.ok && parsed.projection.version).toBe(0)
  })

  it('reports corrupt integrity and folds only the valid prefix when Spec 2 ended it', async () => {
    const lines = demo.split('\n').filter((line) => line !== '')
    lines[19] = lines[19].replace(/"persisted_at_ms":\d+/, '"persisted_at_ms":1')
    const { workflow, play } = routes(`${lines.join('\n')}\n`)
    await play()
    const parsed = parseWorkflowProjection(await workflow.get(PATH), 'demo-mansion')
    expect(parsed.ok && parsed.projection).toMatchObject({ integrity: 'corrupt', version: 19, readOnly: true })
    expect(parsed.ok && parsed.projection.phases[0]).toMatchObject({ status: 'waiting', door: { status: 'waiting' } })
  })

  it('rejects when the recording cannot be loaded and a malformed mansion name', async () => {
    const seance = createSeanceReplayRoutes({ fetch: async () => new Response('missing', { status: 404 }) })
    const workflow = createWorkflowReplayRoutes(seance)
    await expect(workflow.get(PATH)).rejects.toMatchObject({ status: 502 })
    await expect(workflow.get('/apps/haunted-house/api/mansions/%E0%A4%A/workflow')).rejects.toMatchObject({ status: 400 })
  })
})
