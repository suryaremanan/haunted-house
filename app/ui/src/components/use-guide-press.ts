// Pressing (Spec 8, Requirement 4): runs the press plan of a guide option by
// pressing controls the house already has. It finds a control and clicks it;
// it imports no adapter, builds no command and sends nothing. If a control is
// missing or switched off, the plan stops and says why in the room's own
// words. So authority stays exactly where the earlier specs put it.
//
// One press per commit: the next step is issued from an effect after React
// has rendered the result of the one before, so each control sees current
// state, as if the visitor had pressed them in turn.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { GuideTask, PressFocus, PressStep, ShellAction } from '../core/house-guide'
import { surfaceKey } from '../core/house-projection'
import type { OpenFocus } from './RoomPanelHost'

/** What is said when a control cannot be pressed and gives no reason of its own. */
export const NOT_AVAILABLE_TEXT = 'That is not available right now.'
/** A plan that has not finished after this many renders is dropped. */
export const MAX_PLAN_COMMITS = 12

/** The one control of the shell behind each shell action. */
export const SHELL_CONTROL: Readonly<Record<ShellAction, string>> = {
  map: '[data-map-toggle]',
  reveal: '[data-reveal-toggle]',
  'kiro-words': '[data-words-toggle]',
  'needs-you': '[data-opener-key="needs-you"]',
  close: '.hh-ui-panel-close',
  exit: '[data-guide-exit]',
}

function escapeAttribute(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

/** Where focus goes after a `map` step, in the surface stack's own terms. */
export function openFocusOf(focus: PressFocus): OpenFocus {
  switch (focus.kind) {
    case 'heading':
      return { kind: 'heading' }
    case 'proposal':
      return { kind: 'selector', selector: `[data-proposal="${escapeAttribute(focus.proposalId)}"]` }
    case 'section':
      return { kind: 'selector', selector: `[data-section="${escapeAttribute(focus.section)}"]` }
  }
}

function isOff(control: Element): boolean {
  return control.getAttribute('aria-disabled') === 'true' || control.hasAttribute('disabled')
}

/** The reason a switched-off control gives for itself, or null. */
function reasonOf(control: Element, root: ParentNode): string | null {
  const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '')
  const text = ids
    .map((id) => root.querySelector(`[id="${escapeAttribute(id)}"]`)?.textContent?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ')
  return text === '' ? null : text
}

/** Types into a field the way a person does: through its own input event, so its limit and checks apply. */
function typeInto(field: HTMLTextAreaElement | HTMLInputElement, text: string): void {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(field, text)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

interface Plan {
  readonly steps: readonly PressStep[]
  readonly from: HTMLElement | null
  readonly index: number
  /** Renders spent on this plan. */
  readonly commits: number
}

export interface GuidePressOptions {
  /** The house element the controls are looked up in. */
  readonly root: RefObject<HTMLElement>
  /**
   * Told, just before a map control is pressed, where focus should go in the
   * surface it opens and which control the visitor actually pressed (so focus
   * returns there when the surface closes). Cleared again right after.
   */
  readonly setOpening: (opening: { readonly focus: OpenFocus; readonly from: HTMLElement | null } | null) => void
  readonly onTask: (task: GuideTask | null) => void
  /** The sentence shown when a control gives no reason of its own. */
  readonly fallbackReason: () => string | null
}

export interface GuidePress {
  /** Runs a press plan. `from` is the control the visitor pressed. A second plan replaces one still running. */
  readonly run: (steps: readonly PressStep[], from?: HTMLElement | null) => void
  /** Why the last plan stopped early, or null. Cleared by the next plan. */
  readonly refusal: string | null
  readonly clearRefusal: () => void
}

export function useGuidePress({ root, setOpening, onTask, fallbackReason }: GuidePressOptions): GuidePress {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const latest = useRef({ setOpening, onTask, fallbackReason })
  latest.current = { setOpening, onTask, fallbackReason }

  const run = useCallback((steps: readonly PressStep[], from: HTMLElement | null = null) => {
    setRefusal(null)
    setPlan(steps.length === 0 ? null : { steps, from, index: 0, commits: 0 })
  }, [])
  const clearRefusal = useCallback(() => setRefusal(null), [])

  // After each render: press the next control, then let React render again.
  const done = useRef<Plan | null>(null)
  useEffect(() => {
    // Each state of a plan is acted on once, even if the effect runs twice for it.
    if (plan === null || done.current === plan) return
    done.current = plan
    const scope = root.current
    const step = plan.steps[plan.index]
    if (scope === null || step === undefined || plan.commits >= MAX_PLAN_COMMITS) {
      setPlan(null)
      return
    }
    const refuse = (control: Element | null) => {
      setRefusal((control === null ? null : reasonOf(control, scope)) ?? latest.current.fallbackReason() ?? NOT_AVAILABLE_TEXT)
      setPlan(null)
    }
    const advance = () => setPlan(plan.index + 1 >= plan.steps.length ? null : { ...plan, index: plan.index + 1, commits: plan.commits + 1 })
    const controlOf = (key: string) => scope.querySelector<HTMLElement>(`[data-guide-control="${escapeAttribute(key)}"]`)

    switch (step.kind) {
      case 'map': {
        // A map control always opens its surface; a locked room's control opens the words that say why it is locked.
        const control = scope.querySelector<HTMLElement>(`[data-opener-key="${escapeAttribute(surfaceKey(step.target))}"]`)
        if (control === null) return refuse(null)
        latest.current.setOpening({ focus: openFocusOf(step.focus), from: plan.from })
        control.click()
        latest.current.setOpening(null)
        return advance()
      }
      case 'control': {
        const control = controlOf(step.key)
        if (control === null || isOff(control)) return refuse(control)
        // A disclosure that is already open stays open.
        if (control.getAttribute('aria-expanded') !== 'true') control.click()
        return advance()
      }
      case 'fill': {
        const field = controlOf(step.key)
        if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) || field.readOnly || isOff(field)) return refuse(field)
        typeInto(field, step.text)
        field.focus()
        return advance()
      }
      case 'focus': {
        const field = controlOf(step.key)
        if (field === null) return refuse(null)
        field.focus()
        return advance()
      }
      case 'every': {
        const boxes = Array.from(scope.querySelectorAll<HTMLInputElement>(`[data-guide-control^="${escapeAttribute(step.keyPrefix)}"]`))
        for (const box of boxes) if (!isOff(box) && !box.checked) box.click()
        return advance()
      }
      case 'shell': {
        const control = scope.querySelector<HTMLElement>(SHELL_CONTROL[step.action])
        if (control === null || isOff(control)) return refuse(control)
        control.click()
        return advance()
      }
      case 'task':
        latest.current.onTask(step.task)
        return advance()
    }
  }, [plan, root])

  return { run, refusal, clearRefusal }
}
