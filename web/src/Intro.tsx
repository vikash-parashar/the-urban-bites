import { useEffect, useState } from 'react'

// The opening card: logo pops in, the LED roof traces, the name lands, then it lifts away
// to show the hero. Once per visit, skipped for reduced motion, and a tap skips it.
export default function Intro() {
  const [state, setState] = useState<'on' | 'leaving' | 'off'>(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off'
      if (sessionStorage.getItem('ub-intro')) return 'off'
    } catch {
      /* storage blocked: show it */
    }
    return 'on'
  })

  useEffect(() => {
    if (state !== 'on') return
    try {
      sessionStorage.setItem('ub-intro', '1')
    } catch {
      /* ignore */
    }
    const t1 = window.setTimeout(() => setState('leaving'), 2100)
    return () => clearTimeout(t1)
  }, [state])

  useEffect(() => {
    if (state !== 'leaving') return
    const t = window.setTimeout(() => setState('off'), 700)
    return () => clearTimeout(t)
  }, [state])

  if (state === 'off') return null
  return (
    <div className={`intro ${state === 'leaving' ? 'leaving' : ''}`} onClick={() => setState('leaving')} aria-hidden="true">
      <div className="intro-glow" />
      <div className="intro-mark">
        <img src={`${import.meta.env.BASE_URL}brand/mark-256.png`} alt="" width={150} height={150} />
        <svg viewBox="0 0 512 512" className="intro-roof"><path d="M96 214 L256 104 L416 214" /></svg>
        <span className="intro-steam"><i /><i /><i /></span>
      </div>
      <p className="intro-the">THE</p>
      <p className="intro-name"><span>URBAN</span> <em>Bites</em></p>
      <p className="intro-tag">स्वाद · सफ़ाई · गुणवत्ता</p>
    </div>
  )
}
