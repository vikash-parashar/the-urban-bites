import { useEffect, useRef, useState, type RefObject } from 'react'
import { media } from './menu'

const MUSIC_VOL = 0.55 // 55%, as asked
const OFF_KEY = 'ub-music-off'

const musicOff = () => { try { return localStorage.getItem(OFF_KEY) === '1' } catch { return false } }

// Background music plus the kitchen sizzle behind the hero video.
// Browsers block sound until the visitor taps, so the music starts on the first tap anywhere,
// plays the 30-second clip (public/media/good-times-30s.mp3) at 55% and fades out. The button mutes or replays it.
export default function HeroSound({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const [on, setOn] = useState(false)
  const [visible, setVisible] = useState(true)
  const fade = useRef(0)
  const music = useRef<HTMLAudioElement | null>(null)
  const musicFade = useRef(0)

  function rampEl(el: HTMLMediaElement, to: number, ms: number, ref: { current: number }, after?: () => void) {
    cancelAnimationFrame(ref.current)
    const from = el.muted ? 0 : el.volume
    const start = performance.now()
    const step = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - start) / ms))
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k))
      if (k < 1) ref.current = requestAnimationFrame(step)
      else after?.()
    }
    ref.current = requestAnimationFrame(step)
  }

  function ramp(to: number) {
    const v = video.current
    if (!v) return
    if (to > 0) {
      v.muted = false
      v.play().catch(() => {})
    }
    rampEl(v, to, 600, fade, () => { if (to === 0) v.muted = true })
  }

  function startMusic() {
    let a = music.current
    if (!a) {
      a = new Audio(media('good-times-30s.mp3'))
      a.preload = 'auto'
      a.onended = () => setOn(false)
      music.current = a
    }
    a.currentTime = 0
    a.volume = 0
    a.play().then(() => rampEl(a!, MUSIC_VOL, 1200, musicFade)).catch(() => setOn(false))
  }

  function stopMusic() {
    const a = music.current
    if (a && !a.paused) rampEl(a, 0, 500, musicFade, () => a.pause())
  }

  // First tap anywhere on the page starts the music (once), unless the visitor muted it before.
  useEffect(() => {
    if (musicOff()) return
    const first = (e: Event) => {
      if ((e.target as HTMLElement)?.closest?.('.hero-sound')) return // the button handles itself
      setOn(true)
      startMusic()
    }
    window.addEventListener('pointerdown', first, { once: true })
    window.addEventListener('keydown', first, { once: true })
    return () => { window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const v = video.current
    if (!v) return
    const io = new IntersectionObserver(([e]) => setVisible(e.intersectionRatio > 0.35), { threshold: [0, 0.35, 1] })
    io.observe(v.closest('section') ?? v)
    return () => io.disconnect()
  }, [video])

  // The sizzle plays under the music while the hero is on screen.
  useEffect(() => {
    ramp(on && visible ? 0.35 : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, visible])

  useEffect(() => () => { music.current?.pause() }, [])

  function toggle() {
    const next = !on
    setOn(next)
    try { localStorage.setItem(OFF_KEY, next ? '0' : '1') } catch { /* private mode */ }
    if (next) startMusic()
    else stopMusic()
  }

  return (
    <button
      className={`hero-sound ${on ? 'is-on' : ''}`}
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Mute the music and kitchen sound' : 'Play the music and kitchen sound'}
    >
      <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="hero-sound-label">{on ? 'Sound on · tap to mute' : 'Play music'}</span>
    </button>
  )
}
