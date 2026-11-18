// The Sound Feature's one audio adapter (Spec 6 Requirement 9): every sound
// of the house, synthesised in the browser from oscillators and filtered
// noise. No audio file, no sample and no network: the creak of a Door is a
// sawtooth dragged through a resonant filter, written for this repository.
//
// Nothing here runs until the Operator turns sound on: the caller creates the
// engine inside that press, which is also the gesture a browser requires. A
// browser without the Web Audio API gets `null` and the house stays silent.
import type { SoundCue } from '../core/sound-cues'

export interface HouseSound {
  play: (cue: SoundCue) => void
  /**
   * Dread and night (Spec 9, Requirement 7): a low drone while the house is
   * not Calm, and a slow heartbeat at `heartbeatBpm` while something waits on
   * the Visitor (null stops it). Each rises from silence; neither starts loud.
   */
  setDread?: (dread: { readonly drone: boolean; readonly heartbeatBpm: number | null }) => void
  close: () => void
}

/** The drone under the house, relative to the master. */
export const DRONE_GAIN = 0.12
/** The heartbeat, relative to the master. */
export const HEARTBEAT_GAIN = 0.5
/** Every dread sound rises from silence over at least this long, in seconds. */
export const DREAD_RISE_SECONDS = 1.5

/** Overall loudness, kept low: these are cues, not effects to startle. */
export const MASTER_GAIN = 0.22
/** The draught under everything, relative to the master: present, never in the way. */
export const AMBIENT_GAIN = 0.16

type Ctx = AudioContext

interface Voice {
  readonly ctx: Ctx
  readonly out: AudioNode
  readonly noise: AudioBuffer
  readonly at: number
}

function envelope(voice: Voice, peak: number, attack: number, hold: number, release: number, start = 0): GainNode {
  const gain = voice.ctx.createGain()
  const t = voice.at + start
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + attack)
  gain.gain.setValueAtTime(peak, t + attack + hold)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release)
  gain.connect(voice.out)
  return gain
}

function noiseSource(voice: Voice, start: number, length: number): AudioBufferSourceNode {
  const source = voice.ctx.createBufferSource()
  source.buffer = voice.noise
  source.loop = true
  source.start(voice.at + start)
  source.stop(voice.at + start + length)
  return source
}

function tone(voice: Voice, type: OscillatorType, start: number, length: number): OscillatorNode {
  const osc = voice.ctx.createOscillator()
  osc.type = type
  osc.start(voice.at + start)
  osc.stop(voice.at + start + length)
  return osc
}

/** An old hinge: a dragging sawtooth whose pitch catches and slips, sung through two narrow resonances. */
function creak(voice: Voice, length: number, low: number, high: number, peak = 0.5, start = 0): void {
  const t = voice.at + start
  const osc = tone(voice, 'sawtooth', start, length)
  const steps = Math.max(6, Math.round(length * 14))
  // The pitch climbs in small catches, like wood giving way a little at a time.
  for (let index = 0; index <= steps; index += 1) {
    const along = index / steps
    const catchUp = index % 2 === 0 ? 1 : 0.9
    osc.frequency.setValueAtTime((low + (high - low) * along ** 1.6) * catchUp, t + along * length)
  }
  // Stick and slip: the drag itself flutters, fast at first and slowing as the leaf comes to rest.
  const flutter = tone(voice, 'square', start, length)
  flutter.frequency.setValueAtTime(34, t)
  flutter.frequency.exponentialRampToValueAtTime(11, t + length)
  const depth = voice.ctx.createGain()
  depth.gain.value = 0.45
  const body = envelope(voice, peak, 0.05, length * 0.55, length * 0.4, start)
  const drag = voice.ctx.createGain()
  drag.gain.value = 0.55
  flutter.connect(depth).connect(drag.gain)
  for (const [centre, q] of [
    [760, 9],
    [1900, 12],
  ] as const) {
    const filter = voice.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = q
    filter.frequency.setValueAtTime(centre * 0.8, t)
    filter.frequency.linearRampToValueAtTime(centre * 1.25, t + length)
    osc.connect(filter).connect(drag)
  }
  drag.connect(body)
}

/** Wood on wood: a low thump with a short burst of dull noise. */
function thud(voice: Voice, start: number, peak = 0.9, pitch = 92): void {
  const t = voice.at + start
  const osc = tone(voice, 'sine', start, 0.3)
  osc.frequency.setValueAtTime(pitch, t)
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.45, t + 0.22)
  osc.connect(envelope(voice, peak, 0.004, 0.02, 0.2, start))
  const filter = voice.ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 420
  noiseSource(voice, start, 0.12).connect(filter).connect(envelope(voice, peak * 0.5, 0.003, 0.01, 0.08, start))
}

/** A passing draught: noise swept through a moving band, with a faint hollow voice under it. */
function whoosh(voice: Voice, length: number): void {
  const t = voice.at
  const filter = voice.ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 2.2
  filter.frequency.setValueAtTime(260, t)
  filter.frequency.exponentialRampToValueAtTime(1300, t + length * 0.45)
  filter.frequency.exponentialRampToValueAtTime(380, t + length)
  noiseSource(voice, 0, length).connect(filter).connect(envelope(voice, 0.5, length * 0.35, 0.05, length * 0.55))
  const voiceOsc = tone(voice, 'sine', 0, length)
  voiceOsc.frequency.setValueAtTime(330, t)
  voiceOsc.frequency.linearRampToValueAtTime(495, t + length * 0.5)
  voiceOsc.frequency.linearRampToValueAtTime(392, t + length)
  voiceOsc.connect(envelope(voice, 0.12, length * 0.3, 0.1, length * 0.5))
}

/** A small struck bell: a note and its slightly sour partial, left to ring. */
function bell(voice: Voice, pitch: number, start: number, peak = 0.4, ring = 1.1): void {
  for (const [ratio, level] of [
    [1, 1],
    [2.76, 0.35],
    [5.4, 0.12],
  ] as const) {
    const osc = tone(voice, 'sine', start, ring + 0.1)
    osc.frequency.value = pitch * ratio
    osc.connect(envelope(voice, peak * level, 0.004, 0.01, ring * (ratio === 1 ? 1 : 0.5), start))
  }
}

/** A falling moan with a slow shake in it. */
function moan(voice: Voice): void {
  const t = voice.at
  const osc = tone(voice, 'triangle', 0, 0.95)
  osc.frequency.setValueAtTime(410, t)
  osc.frequency.exponentialRampToValueAtTime(150, t + 0.9)
  const shake = tone(voice, 'sine', 0, 0.95)
  shake.frequency.value = 6
  const depth = voice.ctx.createGain()
  depth.gain.value = 14
  shake.connect(depth).connect(osc.frequency)
  osc.connect(envelope(voice, 0.3, 0.06, 0.4, 0.45))
}

const RECIPES: Readonly<Record<SoundCue, (voice: Voice) => void>> = {
  'door-open': (voice) => {
    creak(voice, 1.25, 96, 178)
    thud(voice, 1.22, 0.3, 70)
  },
  'door-knock': (voice) => {
    thud(voice, 0, 0.8, 140)
    thud(voice, 0.19, 0.7, 132)
    thud(voice, 0.44, 0.9, 120)
  },
  'door-seal': (voice) => {
    creak(voice, 0.5, 170, 110, 0.35)
    thud(voice, 0.48, 0.9, 84)
  },
  'door-slam': (voice) => {
    thud(voice, 0, 1, 76)
    thud(voice, 0.07, 0.5, 58)
    creak(voice, 0.3, 240, 200, 0.18, 0.12)
  },
  'ghost-wake': (voice) => whoosh(voice, 0.95),
  'ghost-done': (voice) => {
    bell(voice, 659.25, 0, 0.32)
    bell(voice, 987.77, 0.16, 0.26)
  },
  'ghost-fail': (voice) => moan(voice),
  'needs-you': (voice) => {
    bell(voice, 783.99, 0, 0.3, 0.8)
    bell(voice, 622.25, 0.22, 0.3, 1.2)
  },
  'panel-open': (voice) => creak(voice, 0.42, 130, 205, 0.3),
  'panel-close': (voice) => thud(voice, 0, 0.45, 110),
}

function contextConstructor(): (new () => Ctx) | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

/** Starts the engine. Call it from the press that turns sound on. Null when the browser has no Web Audio. */
export function createHouseSound(): HouseSound | null {
  const Constructor = contextConstructor()
  if (Constructor === null) return null
  let ctx: Ctx
  try {
    ctx = new Constructor()
  } catch {
    return null
  }
  const master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  master.connect(ctx.destination)
  // Two seconds of noise, made once and shared by every cue that needs air or wood.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const samples = noise.getChannelData(0)
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1
  // The house's own breath: a very quiet draught that rises and falls while sound is on.
  const wind = ctx.createBufferSource()
  wind.buffer = noise
  wind.loop = true
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 0.9
  band.frequency.value = 380
  const breath = ctx.createGain()
  breath.gain.value = AMBIENT_GAIN
  const sway = ctx.createOscillator()
  sway.frequency.value = 0.07
  const swayPitch = ctx.createGain()
  swayPitch.gain.value = 190
  const swayLevel = ctx.createGain()
  swayLevel.gain.value = AMBIENT_GAIN * 0.6
  sway.connect(swayPitch).connect(band.frequency)
  sway.connect(swayLevel).connect(breath.gain)
  wind.connect(band).connect(breath).connect(master)
  wind.start()
  sway.start()
  let closed = false
  // The drone: two low tones a fifth apart, darkened, faded in and out.
  const droneLevel = ctx.createGain()
  droneLevel.gain.value = 0.0001
  const droneTone = ctx.createBiquadFilter()
  droneTone.type = 'lowpass'
  droneTone.frequency.value = 240
  for (const [frequency, type] of [[55, 'sine'], [82.4, 'triangle']] as const) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = frequency
    osc.connect(droneTone)
    osc.start()
  }
  droneTone.connect(droneLevel).connect(master)
  // The heartbeat: one beat ("lub-dub") written into a buffer one beat long and looped, so no timer is needed.
  let heart: { source: AudioBufferSourceNode; level: GainNode; bpm: number } | null = null
  const beatBuffer = (bpm: number): AudioBuffer => {
    const length = Math.max(1, Math.round((ctx.sampleRate * 60) / bpm))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    const thump = (at: number, frequency: number, size: number) => {
      const start = Math.round(at * ctx.sampleRate)
      const span = Math.round(0.16 * ctx.sampleRate)
      for (let index = 0; index < span && start + index < length; index += 1) {
        const t = index / ctx.sampleRate
        data[start + index] += size * Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 26)
      }
    }
    thump(0, 52, 1)
    thump(0.24, 44, 0.7)
    return buffer
  }
  const fade = (gain: GainNode, to: number) => {
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), now + DREAD_RISE_SECONDS)
  }
  const stopHeart = () => {
    if (heart === null) return
    const old = heart
    heart = null
    fade(old.level, 0.0001)
    old.source.stop(ctx.currentTime + DREAD_RISE_SECONDS + 0.1)
  }
  return {
    setDread: ({ drone, heartbeatBpm }) => {
      if (closed) return
      try {
        fade(droneLevel, drone ? DRONE_GAIN : 0.0001)
        if (heartbeatBpm === null) {
          stopHeart()
          return
        }
        if (heart !== null && heart.bpm === heartbeatBpm) return
        stopHeart()
        const source = ctx.createBufferSource()
        source.buffer = beatBuffer(heartbeatBpm)
        source.loop = true
        const level = ctx.createGain()
        level.gain.value = 0.0001
        source.connect(level).connect(master)
        source.start()
        fade(level, HEARTBEAT_GAIN)
        heart = { source, level, bpm: heartbeatBpm }
      } catch {
        // A sound that cannot play is skipped. Nothing depends on it.
      }
    },
    play: (cue) => {
      if (closed) return
      try {
        if (ctx.state === 'suspended') void ctx.resume()
        RECIPES[cue]({ ctx, out: master, noise, at: ctx.currentTime + 0.02 })
      } catch {
        // A sound that cannot play is skipped. Nothing depends on it.
      }
    },
    close: () => {
      if (closed) return
      closed = true
      void ctx.close().catch(() => undefined)
    },
  }
}
