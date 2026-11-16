// Replay source of the Room Ghosts answer (Spec 5 task 9.6).
// **Validates: Requirements 10.6, 10.7, 11.5**
import { describe, expect, it, vi } from 'vitest'
import demo from '../../../../../fixtures/replay/demo.jsonl?raw'
import { parseRoomGhosts } from '../../core/room-projection'
import { parseWorkflowProjection } from '../../core/workflow-projection'
import { createRoomGhostsReplayRoutes } from './room-ghosts-replay'
import { createReplaySource } from './replay-source'
import { createSeanceReplayRoutes } from './seance-replay'
import { createWorkflowReplayRoutes } from './workflow-replay'

const MANSION = 'demo-mansion'
const ROUTE = `/apps/haunted-house/api/mansions/${MANSION}/specs/${MANSION}/room-ghosts`

function routes(text = demo, cursor = Number.MAX_SAFE_INTEGER) {
  const fetch = vi.fn(async () => new Response(text, { status: 200 }))
  const source = createReplaySource({ fetch })
  const seance = createSeanceReplayRoutes(source)
  return {
    fetch,
    seance,
    rooms: createRoomGhostsReplayRoutes(seance),
    workflow: createWorkflowReplayRoutes(seance),
    /** Loads the recording, then moves the Attic's Cursor to `cursor`. */
    async play() {
      await seance.presented(MANSION)
      source.present(MANSION, cursor)
    },
  }
}

describe('replay Room Ghosts route', () => {
  it('answers only its own route', () => {
    const { rooms } = routes()
    expect(rooms.get(`/apps/haunted-house/api/mansions/${MANSION}/workflow`)).toBeNull()
    expect(rooms.get(`${ROUTE}/extra`)).toBeNull()
    expect(rooms.get('/api/chat')).toBeNull()
  })

  it('answers with a read-only body the strict parser accepts, at the workflow version of the same records', async () => {
    const kit = routes()
    await kit.play()
    const answer = parseRoomGhosts(await kit.rooms.get(ROUTE), MANSION, MANSION)
    const workflow = parseWorkflowProjection(await kit.workflow.get(`/apps/haunted-house/api/mansions/${MANSION}/workflow`), MANSION)
    if (!answer.ok || !workflow.ok) throw new Error('refused')
    expect(answer.roomGhosts).toMatchObject({ readOnly: true, integrity: 'valid', seanceEnabled: false, taskPlan: null, runs: [], review: null })
    expect(answer.roomGhosts.version).toBe(workflow.projection.version)
    expect(answer.roomGhosts.version).toBeGreaterThan(0)
    // A séance log holds no document text: the answer invents none.
    expect(answer.roomGhosts.documents.map((item) => item.artifact)).toEqual([null, null, null])
  })

  it('follows playback: the version grows with the presented records', async () => {
    const kit = routes(demo, 0)
    await kit.play()
    const early = parseRoomGhosts(await kit.rooms.get(ROUTE))
    const late = routes()
    await late.play()
    const end = parseRoomGhosts(await late.rooms.get(ROUTE))
    if (!early.ok || !end.ok) throw new Error('refused')
    expect(early.roomGhosts.version).toBeLessThan(end.roomGhosts.version)
  })

  it('passes on a broken integrity verdict instead of deciding its own', async () => {
    const lines = demo.trimEnd().split('\n')
    lines[5] = lines[5].replace('"sequence":6', '"sequence":60')
    const kit = routes(`${lines.join('\n')}\n`)
    await kit.play()
    const answer = parseRoomGhosts(await kit.rooms.get(ROUTE))
    if (!answer.ok) throw new Error('refused')
    expect(answer.roomGhosts.integrity).toBe('corrupt')
    expect(answer.roomGhosts.readOnly).toBe(true)
  })

  it('makes no request of its own: one fetch of the recording serves every route', async () => {
    const kit = routes()
    await kit.play()
    await kit.rooms.get(ROUTE)
    await kit.rooms.get(ROUTE)
    await kit.workflow.get(`/apps/haunted-house/api/mansions/${MANSION}/workflow`)
    expect(kit.fetch).toHaveBeenCalledTimes(1)
  })

  it('refuses a name that cannot be decoded', async () => {
    const { rooms } = routes()
    await expect(rooms.get('/apps/haunted-house/api/mansions/%E0%A4%A/specs/x/room-ghosts')).rejects.toMatchObject({ status: 400 })
  })
})
