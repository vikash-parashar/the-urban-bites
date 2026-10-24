import { useEffect, useRef, useState, type RefObject } from 'react'

// Browsers only autoplay muted video, so the sizzle starts on a tap.
// Sound fades in, and goes quiet when the hero scrolls out of view.
export default function HeroSound({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const [on, setOn] = useState(false)
  const [visible, setVisible] = useState(true)
  const fade = useRef(0)

  function ramp(to: number) {
    const v = video.current
    if (!v) return
    cancelAnimationFrame(fade.current)
    if (to > 0) {
      v.muted = false
      v.play().catch(() => {})
    }
    const from = v.muted ? 0 : v.volume
    const start = performance.now()
    const step = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - start) / 600))
      v.volume = Math.max(0, Math.min(1, from + (to - from) * k))
      if (k < 1) fade.current = requestAnimationFrame(step)
      else if (to === 0) v.muted = true
    }
    fade.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    const v = video.current
    if (!v) return
    const io = new IntersectionObserver(([e]) => setVisible(e.intersectionRatio > 0.35), { threshold: [0, 0.35, 1] })
    io.observe(v.closest('section') ?? v)
    return () => io.disconnect()
  }, [video])

  useEffect(() => {
    ramp(on && visible ? 0.9 : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, visible])

  return (
    <button
      className={`hero-sound ${on ? 'is-on' : ''}`}
      onClick={() => setOn((o) => !o)}
      aria-pressed={on}
      aria-label={on ? 'Mute the kitchen sound' : 'Play the kitchen sound'}
    >
      <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="hero-sound-label">{on ? 'Sound on' : 'Hear the sizzle'}</span>
    </button>
  )
}
