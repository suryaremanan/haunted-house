import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseWhoami, WHOAMI_PATH } from '../../core/backend-status'
import { useAppApi } from './index'

// Event playback and the fixture fetch are covered by the replay player tests
// and the replay DOM test. This checks the stand-in's API client.
describe('replay stand-in API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('answers the status check as the replay backend', async () => {
    const body = await useAppApi().get(WHOAMI_PATH)
    expect(body).toEqual({ backend: 'replay', gateway: { version: 'replay' } })
    expect(parseWhoami(body)).toEqual({ kind: 'ok', gateway: { version: 'replay' } })
  })

  it('rejects any other GET with status 404', async () => {
    await expect(useAppApi().get('/api/version')).rejects.toMatchObject({ status: 404 })
  })

  it('rejects every write', async () => {
    const api = useAppApi()
    const writes = [() => api.post('/x', {}), () => api.put('/x', {}), () => api.patch('/x', {}), () => api.del('/x')]
    for (const write of writes) {
      await expect(write()).rejects.toMatchObject({ status: 405 })
    }
  })

  it('makes no network request for API calls', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const api = useAppApi()
    await api.get(WHOAMI_PATH)
    await api.get('/api/version').catch(() => {})
    await api.post('/x').catch(() => {})
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
