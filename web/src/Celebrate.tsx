import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { voiceOn } from './voice'

// Party poppers and confetti when an order is delivered and paid, once per order.
// The sound is made in the browser (a pop, a crackle and a short "ta-da"), so there's no file to load.

const started = new Map<string, number>()
const COLORS = ['#fbbf24', '#22c55e', '#3b82f6', '#ec4899', '#f97316', '#a855f7', '#ffffff']

function partySound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ac = new Ctx()
    ac.resume().catch(() => {})
    const t0 = ac.currentTime + 0.05
    const out = ac.createGain(); out.gain.value = 0.5; out.connect(ac.destination)
    // Two popper "pops": short bursts of filtered noise.
    const noise = (at: number, dur: number, freq: number, vol: number) => {
      const len = Math.floor(ac.sampleRate * dur)
      const buf = ac.createBuffer(1, len, ac.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
      const src = ac.createBufferSource(); src.buffer = buf
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8
      const g = ac.createGain(); g.gain.value = vol
      src.connect(f); f.connect(g); g.connect(out); src.start(at)
    }
    noise(t0, 0.18, 1400, 1.4)
    noise(t0 + 0.12, 0.18, 1100, 1.2)
    // Crackle like small crackers.
    for (let i = 0; i < 14; i++) noise(t0 + 0.3 + Math.random() * 0.9, 0.04, 2500 + Math.random() * 2500, 0.35)
    // Ta-da: a quick rising major chord.
    ;[523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = hz
      const g = ac.createGain()
      const at = t0 + 0.25 + i * 0.09
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.22, at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, at + 0.9)
      o.connect(g); g.connect(out); o.start(at); o.stop(at + 1)
    })
    setTimeout(() => ac.close().catch(() => {}), 2500)
  } catch { /* no audio */ }
}

export default function Celebrate({ id }: { id: string }) {
  const reduce = useReducedMotion()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const k = `ub-party-${id}`
    if (!started.has(id)) {
      let seen = false
      try { seen = !!localStorage.getItem(k); localStorage.setItem(k, '1') } catch { /* private mode: still celebrate */ }
      if (seen) return
      started.set(id, Date.now())
      if (voiceOn()) partySound()
    }
    // The tracker can re-mount mid-celebration; carry on from where it was.
    const left = 4200 - (Date.now() - started.get(id)!)
    if (left <= 0) return
    setShow(true)
    const t = setTimeout(() => setShow(false), left)
    return () => clearTimeout(t)
  }, [id])

  // Pieces fly up out of two poppers at the bottom corners, then fall.
  const pieces = useMemo(() => Array.from({ length: 90 }, (_, i) => {
    const left = i % 2 === 0
    return {
      left,
      x: (left ? 1 : -1) * (80 + Math.random() * 320),
      up: -(380 + Math.random() * 380),
      fall: 260 + Math.random() * 400,
      rot: (Math.random() - 0.5) * 900,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 10,
      c: COLORS[i % COLORS.length],
      d: Math.random() * 0.25,
      round: Math.random() < 0.3,
    }
  }), [])

  if (!show) return null
  // Portal to <body>: the tracker sits in a sliding drawer, and a transformed parent would trap position: fixed.
  return createPortal(
    <div className="party" aria-hidden="true">
      {!reduce && pieces.map((p, i) => (
        <motion.i key={i} className="party-bit"
          style={{ [p.left ? 'left' : 'right']: '6%', width: p.w, height: p.round ? p.w : p.h, background: p.c, borderRadius: p.round ? '50%' : 2 } as React.CSSProperties}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: [0, p.x * 0.8, p.x], y: [0, p.up, p.up + p.fall], rotate: p.rot, opacity: [1, 1, 0] }}
          transition={{ duration: 2.8, delay: p.d, times: [0, 0.35, 1], ease: ['easeOut', 'easeIn'] }} />
      ))}
      {['🎉', '🎊'].map((e, i) => (
        <motion.span key={e} className={`party-popper ${i ? 'right' : 'left'}`}
          initial={{ scale: 0, rotate: i ? 20 : -20 }} animate={{ scale: [0, 1.5, 1.2], rotate: i ? -10 : 10 }} transition={{ duration: 0.5 }}>{e}</motion.span>
      ))}
      <motion.div className="party-msg" initial={{ scale: 0.6, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 14 }}>
        <b>Order complete!</b><span>Thank you for eating with The Urban Bites 🙏</span>
      </motion.div>
    </div>,
    document.body,
  )
}
