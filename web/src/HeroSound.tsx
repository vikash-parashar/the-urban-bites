import { useEffect, useRef, useState } from 'react'
import { media } from './menu'

const MUSIC_VOL = 0.55 // 55%, as asked
const OFF_KEY = 'ub-music-off'

const musicOff = () => { try { return localStorage.getItem(OFF_KEY) === '1' } catch { return false } }

// Background music for every visitor: the 30-second clip (public/media/good-times-30s.mp3) at 55%.
// The videos stay silent; this track is the only sound.
// It tries to start as soon as the page opens. Most browsers block sound until the visitor
// touches the page, so if that happens it starts on the first tap, key press or scroll.
// The floating button mutes it, and the choice is remembered.
export default function HeroSound() {
  const [on, setOn] = useState(!musicOff())
  const music = useRef<HTMLAudioElement | null>(null)
  const fade = useRef(0)
  const playing = useRef(false)

  function rampTo(el: HTMLMediaElement, to: number, ms: number, after?: () => void) {
    cancelAnimationFrame(fade.current)
    const from = el.volume
    const start = performance.now()
    const step = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - start) / ms))
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k))
      if (k < 1) fade.current = requestAnimationFrame(step)
      else after?.()
    }
    fade.current = requestAnimationFrame(step)
  }

  function audio() {
    if (!music.current) {
      const a = new Audio(media('good-times-30s.mp3'))
      a.preload = 'auto'
      a.onended = () => { playing.current = false; setOn(false) }
      music.current = a
    }
    return music.current
  }

  // Resolves true when the browser let the music play.
  function startMusic(fromStart = true): Promise<boolean> {
    const a = audio()
    if (fromStart) a.currentTime = 0
    a.volume = 0
    return a.play().then(() => {
      playing.current = true
      rampTo(a, MUSIC_VOL, 1200)
      return true
    }).catch(() => false)
  }

  function stopMusic() {
    const a = music.current
    playing.current = false
    if (a && !a.paused) rampTo(a, 0, 400, () => a.pause())
  }

  // Play by default: try straight away, else on the first interaction anywhere.
  useEffect(() => {
    if (musicOff()) return
    const events = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'] as const
    let trying = false
    const off = () => events.forEach((e) => window.removeEventListener(e, kick))
    const kick = (e: Event) => {
      if ((e.target as HTMLElement)?.closest?.('.hero-sound')) return // the button handles itself
      if (playing.current || musicOff()) return off()
      if (trying) return
      trying = true
      startMusic().then((ok) => { trying = false; if (ok) off() })
    }
    startMusic().then((ok) => {
      if (!ok) events.forEach((e) => window.addEventListener(e, kick, { passive: true }))
    })
    return () => { off(); music.current?.pause() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle() {
    // On but blocked by the browser (not playing yet): a tap on the button starts it.
    const next = !(on && playing.current)
    setOn(next)
    try { localStorage.setItem(OFF_KEY, next ? '0' : '1') } catch { /* private mode */ }
    if (next) startMusic(!music.current || music.current.ended)
    else stopMusic()
  }

  return (
    <button
      className={`hero-sound ${on ? 'is-on' : ''}`}
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Mute the music' : 'Play the music'}
    >
      <span className="hero-sound-ico" aria-hidden="true">{on ? "🔊" : "🔇"}</span>
      <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="hero-sound-label">{on ? 'Mute music' : 'Play music'}</span>
    </button>
  )
}
