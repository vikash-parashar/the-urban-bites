// Alert sounds for the staff screens, made with Web Audio (no sound files to host or license).
// Manjeet picks a sound per event and a loudness on his tablet; the choice is kept on that device.

export type SoundId = 'bell' | 'tring' | 'loud' | 'kitchen' | 'horn' | 'beep' | 'off'
export type SoundEvent = 'new' | 'pending' | 'cancelled'
export type Loudness = 'normal' | 'loud' | 'max'

export const SOUNDS: { id: SoundId; label: string; hint: string }[] = [
  { id: 'tring', label: '☎️ Tring tring', hint: 'Old phone ringing' },
  { id: 'bell', label: '🔔 Bell', hint: 'Soft three-note bell' },
  { id: 'loud', label: '🚨 Loud alarm', hint: 'Hard to miss in a rush' },
  { id: 'kitchen', label: '🛎️ Counter bell', hint: 'Ding ding, like a hotel desk' },
  { id: 'horn', label: '🚚 Truck horn', hint: 'Highway horn, very loud' },
  { id: 'beep', label: '📟 Beep beep', hint: 'Digital beeps' },
  { id: 'off', label: '🔕 No sound', hint: 'Silent for this one' },
]

export const EVENTS: { id: SoundEvent; label: string; hint: string }[] = [
  { id: 'new', label: 'New order', hint: 'Plays the moment an order comes in' },
  { id: 'pending', label: 'Order still waiting', hint: 'Repeats while an order is not accepted yet' },
  { id: 'cancelled', label: 'Customer cancelled', hint: 'When a customer cancels before cooking' },
]

export type SoundPrefs = { new: SoundId; pending: SoundId; cancelled: SoundId; loudness: Loudness; every: number }
const DEFAULTS: SoundPrefs = { new: 'tring', pending: 'bell', cancelled: 'beep', loudness: 'loud', every: 30 }
const KEY = 'ub-sound-prefs'

export function loadPrefs(): SoundPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* private mode */ }
  return DEFAULTS
}
export function savePrefs(p: SoundPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode */ }
  window.dispatchEvent(new Event('ub-sound-prefs'))
}

// One shared audio context, resumed by the first tap (browsers block sound before that).
let ctxRef: AudioContext | null = null
export function audio(): AudioContext | null {
  try {
    if (!ctxRef) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctxRef = new Ctx()
    }
    return ctxRef
  } catch { return null }
}

const GAIN: Record<Loudness, number> = { normal: 0.35, loud: 0.7, max: 1 }

// tone plays one note into a shared output; `type` square/sawtooth sound louder than sine.
function tone(ctx: AudioContext, out: AudioNode, f: number, t: number, dur: number, type: OscillatorType, peak: number, f2?: number) {
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (f2) o.frequency.linearRampToValueAtTime(f2, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.015)
  g.gain.setValueAtTime(peak, t + Math.max(0.02, dur - 0.05))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

// play rings one of the sounds. Returns nothing; silently does nothing before the first tap.
export function play(id: SoundId, loudness: Loudness = loadPrefs().loudness) {
  if (id === 'off') return
  const ctx = audio()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  // A compressor keeps "max" loud without crackling.
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -12; comp.ratio.value = 6
  const master = ctx.createGain()
  master.gain.value = GAIN[loudness]
  master.connect(comp).connect(ctx.destination)
  const t0 = ctx.currentTime + 0.02

  switch (id) {
    case 'bell':
      ;[880, 1175, 1568].forEach((f, i) => tone(ctx, master, f, t0 + i * 0.16, 0.6, 'triangle', 0.6))
      break
    case 'tring':
      // Two rings of an old phone: 440 + 480 Hz warbling fast, "tring... tring".
      for (const start of [0, 0.75]) {
        for (let k = 0; k < 10; k++) {
          const t = t0 + start + k * 0.05
          tone(ctx, master, k % 2 ? 480 : 440, t, 0.05, 'square', 0.45)
          tone(ctx, master, k % 2 ? 1440 : 1320, t, 0.05, 'sine', 0.25)
        }
      }
      break
    case 'loud':
      // Rising siren, three sweeps.
      for (let i = 0; i < 3; i++) tone(ctx, master, 700, t0 + i * 0.45, 0.42, 'sawtooth', 0.6, 1400)
      break
    case 'kitchen':
      ;[0, 0.35].forEach((d) => { tone(ctx, master, 2093, t0 + d, 0.9, 'sine', 0.7); tone(ctx, master, 4186, t0 + d, 0.5, 'sine', 0.2) })
      break
    case 'horn':
      ;[0, 0.55].forEach((d) => { tone(ctx, master, 233, t0 + d, 0.45, 'sawtooth', 0.6); tone(ctx, master, 294, t0 + d, 0.45, 'sawtooth', 0.5) })
      break
    case 'beep':
      for (let i = 0; i < 4; i++) tone(ctx, master, 1800, t0 + i * 0.18, 0.1, 'square', 0.45)
      break
  }
}

// ring plays the sound Manjeet chose for this event.
export function ring(ev: SoundEvent) {
  const p = loadPrefs()
  play(p[ev], p.loudness)
}
