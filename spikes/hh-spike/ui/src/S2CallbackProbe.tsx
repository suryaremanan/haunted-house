import { useAppApi, useAppEvents } from '@kirocrew/app-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  SUPPORTED_CREW_EVENT_TYPES,
  appendBoundedCapture,
  buildProbeReport,
  captureCrewCallback,
  captureHistory,
  makeCrewEnvelope,
  type CallbackCapture,
  type CrewEnvelope,
  type HistoryCapture,
  type SupportedCrewEventType,
} from './s2-callback-contract'

interface CallbackSubscriptionProps {
  type: SupportedCrewEventType
  onEnvelope: (envelope: CrewEnvelope) => void
}

function CallbackSubscription({ type, onEnvelope }: CallbackSubscriptionProps) {
  const onData = useCallback(
    (data: unknown) => onEnvelope(makeCrewEnvelope(type, data)),
    [onEnvelope, type],
  )
  // Crew 0.12.2 returns no public unsubscribe function. Unmounting this child
  // exercises the cleanup returned by the host hook's own effect.
  useAppEvents(type, onData)
  return null
}

function safeFailure(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'request_failed'
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? `http_${status}` : 'request_failed'
}

export function S2CallbackProbe() {
  const api = useAppApi()
  const [targetSlot, setTargetSlot] = useState('')
  const [subscriptionsMounted, setSubscriptionsMounted] = useState(false)
  const [captures, setCaptures] = useState<readonly CallbackCapture[]>([])
  const [history, setHistory] = useState<HistoryCapture | null>(null)
  const [mountCount, setMountCount] = useState(0)
  const [onlineIndications, setOnlineIndications] = useState(0)
  const [visibilityReturns, setVisibilityReturns] = useState(0)
  const [callbacksAfterUnmount, setCallbacksAfterUnmount] = useState(0)
  const [unsubscribeStimulusCompleted, setUnsubscribeStimulusCompleted] = useState(false)
  const [status, setStatus] = useState('Enter one app-owned slot before arming the probe.')
  const acceptingCallbacks = useRef(false)

  useEffect(() => {
    const onOnline = () => setOnlineIndications((count) => count + 1)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setVisibilityReturns((count) => count + 1)
      }
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const onEnvelope = useCallback(
    (envelope: CrewEnvelope) => {
      const capture = captureCrewCallback(envelope, targetSlot.trim())
      if (!capture) return
      if (!acceptingCallbacks.current) {
        setCallbacksAfterUnmount((count) => count + 1)
        return
      }
      setCaptures((current) => appendBoundedCapture(current, capture))
    },
    [targetSlot],
  )

  const arm = () => {
    if (!targetSlot.trim()) {
      setStatus('A target slot is required. The probe will not record global traffic.')
      return
    }
    acceptingCallbacks.current = true
    setSubscriptionsMounted(true)
    setMountCount((count) => count + 1)
    setCallbacksAfterUnmount(0)
    setUnsubscribeStimulusCompleted(false)
    setStatus('Armed for the selected app-owned slot.')
  }

  const unmountSubscriptions = () => {
    acceptingCallbacks.current = false
    setSubscriptionsMounted(false)
    setStatus('Subscriptions unmounted. Send a target-slot event to test cleanup.')
  }

  const sendSafeTurn = async (afterUnmount: boolean) => {
    if (!targetSlot.trim()) {
      setStatus('A target slot is required.')
      return
    }
    if (afterUnmount) {
      acceptingCallbacks.current = false
      setSubscriptionsMounted(false)
      setCallbacksAfterUnmount(0)
      setUnsubscribeStimulusCompleted(false)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    } else if (!subscriptionsMounted) {
      setStatus('Arm the callback subscriptions before sending the observed turn.')
      return
    }
    setStatus(afterUnmount ? 'Sending the cleanup-check turn…' : 'Sending a no-tool turn…')
    try {
      await api.post('/api/chat', {
        slot: targetSlot.trim(),
        message: 'Reply with exactly CALLBACK_PROBE_OK. Do not call tools.',
      })
      if (afterUnmount) setUnsubscribeStimulusCompleted(true)
      setStatus(
        afterUnmount
          ? 'Cleanup-check turn finished. Inspect the unsubscribe result.'
          : 'No-tool turn finished.',
      )
    } catch (error) {
      setStatus(`Safe turn ${safeFailure(error)}.`)
    }
  }

  const sendSafeReadTurn = async () => {
    if (!targetSlot.trim() || !subscriptionsMounted) {
      setStatus('Enter the target slot and arm the callback subscriptions first.')
      return
    }
    setStatus('Sending a read-only tool turn…')
    try {
      await api.post('/api/chat', {
        slot: targetSlot.trim(),
        message: 'Read README.md, make no changes, and reply with exactly CALLBACK_READ_OK.',
      })
      setStatus('Read-only turn finished. No approval should have been required.')
    } catch (error) {
      setStatus(`Read-only turn ${safeFailure(error)}.`)
    }
  }

  const readHistory = async () => {
    const slot = targetSlot.trim()
    if (!slot) {
      setStatus('A target slot is required.')
      return
    }
    setStatus('Reading bounded target-slot history…')
    try {
      const response = await api.get(`/api/chat/slots/${encodeURIComponent(slot)}`)
      const capture = captureHistory(response, slot)
      setHistory(capture)
      setStatus(
        capture
          ? 'Target-slot history shape captured without values.'
          : 'History lacked one unambiguous target slot; nothing was captured.',
      )
    } catch (error) {
      setHistory(null)
      setStatus(`History read ${safeFailure(error)}.`)
    }
  }

  const clear = () => {
    setCaptures([])
    setHistory(null)
    setCallbacksAfterUnmount(0)
    setUnsubscribeStimulusCompleted(false)
    setStatus('Capture cleared.')
  }

  const report = useMemo(
    () =>
      buildProbeReport({
        captures,
        mountCount,
        onlineIndications,
        visibilityReturnIndications: visibilityReturns,
        unsubscribeStimulusCompleted,
        callbacksAfterUnmount,
        history,
      }),
    [
      callbacksAfterUnmount,
      captures,
      history,
      mountCount,
      onlineIndications,
      unsubscribeStimulusCompleted,
      visibilityReturns,
    ],
  )

  return (
    <section aria-labelledby="s2-callback-probe-heading">
      <h2 id="s2-callback-probe-heading">S2 callback probe</h2>
      <p>
        This development probe records field types and bounded flags only. It ignores callbacks
        without the exact app-owned slot.
      </p>
      <label>
        App-owned slot
        <input
          value={targetSlot}
          onChange={(event) => setTargetSlot(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div>
        <button type="button" onClick={arm}>Arm subscriptions</button>{' '}
        <button type="button" onClick={unmountSubscriptions}>Unmount subscriptions</button>{' '}
        <button type="button" onClick={() => void sendSafeTurn(false)}>Run no-tool turn</button>{' '}
        <button type="button" onClick={() => void sendSafeReadTurn()}>Run read-only tool turn</button>{' '}
        <button type="button" onClick={() => void sendSafeTurn(true)}>
          Run post-unmount check
        </button>{' '}
        <button type="button" onClick={() => void readHistory()}>Read post-restart history</button>{' '}
        <button type="button" onClick={clear}>Clear</button>
      </div>
      <p role="status">{status}</p>
      <p>Subscriptions: {subscriptionsMounted ? 'mounted' : 'unmounted'}</p>
      {subscriptionsMounted
        ? SUPPORTED_CREW_EVENT_TYPES.map((type) => (
            <CallbackSubscription key={type} type={type} onEnvelope={onEnvelope} />
          ))
        : null}
      <details>
        <summary>Scrubbed machine-readable result</summary>
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </section>
  )
}
