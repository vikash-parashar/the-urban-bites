// Spoken order updates in Haryanvi (Hindi as the fallback voice).
// Each line plays a recorded clip from /voice/hr/<key>.mp3 when one is uploaded; until then the
// phone's own Hindi voice reads the Devanagari text. Clips can be dropped into web/public/voice/hr/
// with these exact names, and they take over automatically.

import data from '../voice-lines.json'

export type VoiceKey = keyof typeof data.lines

// Haryanvi lines live in web/voice-lines.json, shared with the GitHub Action that records the clips.
export const LINES = Object.fromEntries(Object.entries(data.lines).map(([k, v]) => [k, v.text])) as Record<VoiceKey, string>

const KEY = 'ub-voice'
export function voiceOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}
export function setVoiceOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode */ }
}

const missing = new Set<VoiceKey>()
let queue: Promise<void> = Promise.resolve()

// Pick the most human-sounding Hindi voice the phone has. The newer "natural"/"neural"/online
// voices (Google, Microsoft Edge, Android network voices) sound far less robotic than the
// old offline ones, so they win; a female voice is preferred when the name tells us.
function bestHindiVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const hindi = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('hi'))
  if (!hindi.length) return null
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase()
    let sc = 0
    if (/natural|neural|online|network|wavenet|premium|enhanced/.test(n)) sc += 10
    if (/google/.test(n)) sc += 6
    if (/swara|kalpana|female|hia|hic/.test(n)) sc += 3
    if (!v.localService) sc += 2
    if (v.lang === 'hi-IN') sc += 1
    return sc
  }
  return hindi.sort((a, b) => score(b) - score(a))[0]
}

// Voices load late on some browsers; ask once early so the first update already gets a good one.
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices())
}

function speakText(text: string): Promise<void> {
  return new Promise((done) => {
    const synth = window.speechSynthesis
    if (!synth) return done()
    const u = new SpeechSynthesisUtterance(text)
    u.voice = bestHindiVoice(synth.getVoices())
    u.lang = 'hi-IN'
    u.rate = 1.15
    u.pitch = 1
    u.onend = () => done()
    u.onerror = () => done()
    synth.speak(u)
    setTimeout(done, 12_000)
  })
}

function playClip(key: VoiceKey): Promise<boolean> {
  if (missing.has(key)) return Promise.resolve(false)
  return new Promise((done) => {
    const a = new Audio(`${import.meta.env.BASE_URL}voice/hr/${key}.mp3`)
    a.onended = () => done(true)
    a.onerror = () => { missing.add(key); done(false) }
    a.play().catch(() => { done(false) })
  })
}

/** say plays one update out loud (recorded clip first, phone voice otherwise). Calls queue up. */
export function say(key: VoiceKey, force = false) {
  if (!force && !voiceOn()) return
  queue = queue.then(async () => {
    // Tell the background music to dip while someone is talking.
    window.dispatchEvent(new CustomEvent('ub-voice', { detail: true }))
    if (!(await playClip(key))) await speakText(LINES[key])
    window.dispatchEvent(new CustomEvent('ub-voice', { detail: false }))
  })
}

/** sayText reads a line that changes every time (order number, customer name) with the phone's
 *  Hindi voice, queued after any clip that is playing. */
export function sayText(text: string, force = false) {
  if (!force && !voiceOn()) return
  queue = queue.then(async () => {
    window.dispatchEvent(new CustomEvent('ub-voice', { detail: true }))
    await speakText(text)
    window.dispatchEvent(new CustomEvent('ub-voice', { detail: false }))
  })
}

/** spokenNumber reads 1042 the way counters call it out: "10 42" (दस बयालीस). */
export function spokenNumber(n: number | string) {
  const s = String(n)
  return s.length === 4 ? `${s.slice(0, 2)} ${s.slice(2)}` : s
}

/** firstName keeps the first word of a customer's name, for "Ramesh ji". */
export const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'ग्राहक'

/** greetOnce says a greeting once a day per browser, at the visitor's first tap or key press
 *  (browsers block sound before that). */
export function greetOnce(key: VoiceKey, pick?: () => VoiceKey) {
  const k = `ub-greet-${key}`
  const today = new Date().toDateString()
  try { if (localStorage.getItem(k) === today) return () => {} } catch { /* private mode: still greet */ }
  const events = ['pointerdown', 'keydown', 'touchstart'] as const
  const go = () => {
    off()
    if (!voiceOn()) return
    try { localStorage.setItem(k, today) } catch { /* blocked */ }
    say(pick ? pick() : key)
  }
  const off = () => events.forEach((e) => removeEventListener(e, go))
  events.forEach((e) => addEventListener(e, go, { once: true, passive: true }))
  return off
}

const lastFun = new Map<string, number>()
/** sayFun plays a light-hearted line, but not too often: each group waits `gapMs` before it can talk again. */
export function sayFun(group: string, keys: VoiceKey[], gapMs = 90_000) {
  const now = Date.now()
  if (now - (lastFun.get(group) ?? -Infinity) < gapMs) return
  lastFun.set(group, now)
  say(keys[Math.floor(Math.random() * keys.length)])
}

/** cookingKey picks the clip for the ready time the owner set. */
export function cookingKey(mins: number | null | undefined): VoiceKey {
  const k = `cooking_${mins}` as VoiceKey
  return k in LINES ? k : 'cooking'
}
