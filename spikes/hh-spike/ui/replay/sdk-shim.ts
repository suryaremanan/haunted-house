// Replay stand-in for @kirocrew/app-sdk: plays a recorded fixture instead of a live gateway.
import { useEffect } from 'react'

type Frame = { t: number; frame: { type: string; data: unknown } }
type Cb = (data: unknown) => void
const subs = new Map<string, Set<Cb>>()
let started = false

async function play(speed = 4) {
  if (started) return
  started = true
  const text = await (await fetch('./fixture.jsonl')).text()
  const rows: Frame[] = text.split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const t0 = rows[0]?.t ?? 0
  for (const r of rows) {
    setTimeout(() => subs.get(r.frame.type)?.forEach((cb) => cb(r.frame.data)), ((r.t - t0) * 1000) / speed)
  }
}

export function useAppEvents(event: string, cb: Cb): () => void {
  useEffect(() => {
    const set = subs.get(event) ?? new Set<Cb>()
    set.add(cb)
    subs.set(event, set)
    void play()
    return () => { set.delete(cb) }
  }, [event])
  return () => {}
}
export const useAppApi = () => ({ get: async () => ({ replay: true }) })
