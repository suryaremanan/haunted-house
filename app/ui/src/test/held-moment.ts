// The demo recording up to its held moment: record 64, when every Ghost_State
// shows at once and Tinker 2 waits on the owner's decision. The recording goes
// on past it (the refusal, the narrower retry, the release and the last Door);
// tests about the six states read this prefix, tests about the ending read the
// whole log. scripts/build_replay_fixture.py names the same count.
import demo from '../../../../fixtures/replay/demo.jsonl?raw'

export const HELD_MOMENT_RECORDS = 64

/** The first HELD_MOMENT_RECORDS lines of the demo log, each ending in a newline. */
export const heldMoment: string = demo
  .split('\n')
  .filter((line) => line !== '')
  .slice(0, HELD_MOMENT_RECORDS)
  .map((line) => `${line}\n`)
  .join('')
