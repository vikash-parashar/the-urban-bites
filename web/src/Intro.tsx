import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { brand } from './brand'

const up = (delay: number) => ({ initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } })

// The opening card: logo pops in, the LED roof traces, the name lands, then it lifts away
// to show the hero. Once per visit, skipped for reduced motion, and a tap skips it.
export default function Intro() {
  const [on, setOn] = useState(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
      if (sessionStorage.getItem('ub-intro')) return false
    } catch {
      /* storage blocked: show it */
    }
    return true
  })

  useEffect(() => {
    if (!on) return
    try {
      sessionStorage.setItem('ub-intro', '1')
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => setOn(false), 2100)
    return () => clearTimeout(t)
  }, [on])

  return (
    <AnimatePresence>
      {on && (
        <motion.div className="intro" onClick={() => setOn(false)} aria-hidden="true"
          exit={{ opacity: 0, y: '-6%', transition: { duration: 0.7, ease: [0.7, 0, 0.3, 1] } }}>
          <motion.div className="intro-glow" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 2.2, ease: 'easeOut' }} />
          <motion.div className="intro-mark" initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
            <img className="intro-logo intro-logo-dark" src={brand.stackedUrl} alt="" width={300} height={240} />
            <img className="intro-logo intro-logo-light" src={brand.stackedLightUrl} alt="" width={300} height={240} />
            <span className="intro-steam">
              {[0, 0.3, 0.6].map((d) => (
                <motion.i key={d} animate={{ y: [8, -14], opacity: [0, 1, 0] }} transition={{ duration: 1.4, delay: d, repeat: Infinity, ease: 'easeInOut' }} />
              ))}
            </span>
          </motion.div>
          <motion.p className="intro-tag" {...up(1.15)}>{brand.tagline_hi}</motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
