// One icon per state, always rendered next to that state's words. Icons are
// decorative (aria-hidden): the text beside them carries the meaning.
import { Ban, CircleCheck, CircleDashed, DoorClosed, DoorOpen, Hourglass, LoaderCircle, Lock, Moon, Play, TriangleAlert } from 'lucide-react'
import type { GhostState } from '../../core/ghost-state'
import type { DoorStatus, PhaseStatus, RiskyStatus } from '../../core/workflow-projection'

export type Tone = 'plain' | 'ok' | 'attention'

const common = { size: 16, 'aria-hidden': true } as const

export const PHASE_TONE: Readonly<Record<PhaseStatus, Tone>> = {
  not_started: 'plain',
  ready: 'plain',
  starting: 'plain',
  working: 'plain',
  waiting: 'attention',
  revision_required: 'attention',
  approved: 'ok',
  failed: 'attention',
  done: 'ok',
}

export const DOOR_TONE: Readonly<Record<DoorStatus, Tone>> = {
  sealed: 'plain',
  waiting: 'attention',
  open: 'ok',
  rejected: 'attention',
}

export const GHOST_TONE: Readonly<Record<GhostState, Tone>> = {
  idle: 'plain',
  working: 'plain',
  waiting: 'attention',
  blocked: 'attention',
  failed: 'attention',
  done: 'ok',
}

export function PhaseIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case 'not_started':
      return <CircleDashed {...common} />
    case 'ready':
      return <Play {...common} />
    case 'starting':
    case 'working':
      return <LoaderCircle {...common} className="hh-spin" />
    case 'waiting':
      return <Hourglass {...common} />
    case 'revision_required':
      return <Ban {...common} />
    case 'failed':
      return <TriangleAlert {...common} />
    case 'approved':
    case 'done':
      return <CircleCheck {...common} />
  }
}

export function DoorIcon({ status }: { status: DoorStatus }) {
  switch (status) {
    case 'sealed':
      return <Lock {...common} />
    case 'waiting':
      return <DoorClosed {...common} />
    case 'open':
      return <DoorOpen {...common} />
    case 'rejected':
      return <Ban {...common} />
  }
}

export function GhostIcon({ state }: { state: GhostState }) {
  switch (state) {
    case 'idle':
      return <Moon {...common} />
    case 'working':
      return <LoaderCircle {...common} className="hh-spin" />
    case 'waiting':
      return <Hourglass {...common} />
    case 'blocked':
      return <Lock {...common} />
    case 'failed':
      return <TriangleAlert {...common} />
    case 'done':
      return <CircleCheck {...common} />
  }
}

export function RiskyIcon({ status }: { status: RiskyStatus }) {
  switch (status) {
    case 'pending':
      return <Hourglass {...common} />
    case 'approved':
    case 'succeeded':
      return <CircleCheck {...common} />
    case 'consumed':
      return <LoaderCircle {...common} className="hh-spin" />
    case 'rejected':
    case 'superseded':
      return <Ban {...common} />
    case 'failed':
      return <TriangleAlert {...common} />
  }
}
