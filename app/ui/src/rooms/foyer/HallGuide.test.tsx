// The Warden beside his balloon, at the Gate and in the Foyer hall (Spec 8,
// Requirements 1, 6 and 9): what he says, how he stands, and stepping back.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HallOption } from '../../core/first-visit'
import { WARDEN_POSES } from '../../core/house-guide'
import { CALL_WARDEN_HINT, CALL_WARDEN_LABEL, HallGuide, STEPPED_BACK_LABEL, type HallGuideProps } from './HallGuide'

const OPTIONS: readonly HallOption[] = [
  { id: 'build-new', label: 'Build something new', consequence: 'Asks what you want to build. Nothing is made yet.' },
  { id: 'step-outside', label: 'Step outside', consequence: 'Shows the front gate again and forgets your name. Nothing else changes.' },
]

function mount(props: Partial<HallGuideProps> = {}) {
  const calls = { onPress: vi.fn<HallGuideProps['onPress']>(), onStepBack: vi.fn(), onCallWarden: vi.fn() }
  const view = render(
    <HallGuide status="No mansion stands here yet." question="What do you want to do?" options={OPTIONS} pose="pointing" poseLabel="The Warden points to your next step." words="plain" quiet={false} {...calls} {...props} />,
  )
  return { ...calls, ...view }
}

describe('the Warden before a mansion is open', () => {
  it('says what is true, asks, and offers each choice with what pressing it does', () => {
    const { onPress } = mount()
    expect(document.querySelector('[data-guide-text]')!.textContent).toBe('No mansion stands here yet.')
    expect(screen.getByText('What do you want to do?')).toBeInTheDocument()
    for (const option of OPTIONS) expect(screen.getByRole('button', { name: option.label })).toHaveAccessibleDescription(option.consequence)
    const build = screen.getByRole('button', { name: 'Build something new' })
    fireEvent.click(build)
    // The choice and the button it was pressed on go up; he does nothing himself.
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledWith(OPTIONS[0], build)
  })

  it('is a hidden drawing with his stance in words beside it, in every pose', () => {
    for (const pose of WARDEN_POSES.filter((candidate) => candidate !== 'stepped-back')) {
      const { unmount } = mount({ pose, poseLabel: `Label for ${pose}.` })
      expect(document.querySelector('.hh-hall-warden')).toHaveAttribute('aria-hidden', 'true')
      expect(document.querySelector('.hh-paint-warden')).toHaveAttribute('data-pose', pose)
      expect(document.querySelector('[data-guide-pose]')).toHaveAttribute('data-guide-pose', pose)
      expect(document.querySelector('[data-guide-pose]')!.textContent).toBe(`Label for ${pose}.`)
      unmount()
    }
  })

  it('puts the balloon away when he steps back, keeps the screen’s own form, and can be called again', () => {
    const own = <form aria-label="The screen's own form" />
    const { onStepBack, onCallWarden, rerender } = mount({ children: own })
    // Talking: the form is inside his balloon.
    expect(document.querySelector('[data-guide-balloon]')!.contains(screen.getByRole('form'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Step back' }))
    expect(onStepBack).toHaveBeenCalledTimes(1)

    rerender(
      <HallGuide status="No mansion stands here yet." question={null} options={OPTIONS} pose="pointing" poseLabel="unused" words="plain" quiet onPress={() => {}} onStepBack={onStepBack} onCallWarden={onCallWarden}>
        {own}
      </HallGuide>,
    )
    expect(document.querySelector('[data-guide-balloon]')).toBeNull()
    expect(screen.getByRole('form')).toBeInTheDocument()
    expect(document.querySelector('.hh-paint-warden')).toHaveAttribute('data-pose', 'stepped-back')
    expect(document.querySelector('[data-guide-pose]')!.textContent).toBe(STEPPED_BACK_LABEL)
    const call = screen.getByRole('button', { name: CALL_WARDEN_LABEL })
    expect(call).toHaveAccessibleDescription(CALL_WARDEN_HINT)
    fireEvent.click(call)
    expect(onCallWarden).toHaveBeenCalledTimes(1)
  })

  it('is no dialog and no live region', () => {
    mount()
    expect(document.querySelector('[role="dialog"], [aria-modal], [aria-live], [role="status"], [role="alert"]')).toBeNull()
  })
})
