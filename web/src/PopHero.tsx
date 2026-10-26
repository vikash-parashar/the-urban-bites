import { motion } from 'motion/react'
import type { RefObject } from 'react'
import { dishImage } from './menu'

// Street Pop hero extras: a plate and stickers visitors can drag around the hero.
export default function PopHero({ box, freeMin, delay }: { box: RefObject<HTMLElement | null>; freeMin: number; delay: number }) {
  const stickers = [
    { t: '100% VEG', c: 'g', x: '48%', y: '58%', r: -10 },
    { t: 'HOT 🔥', c: 'p', x: '80%', y: '12%', r: 9 },
    { t: `FREE DELIVERY >₹${freeMin}`, c: 'c', x: '66%', y: '78%', r: -6 },
    { t: 'TANDOOR FRESH', c: 'w', x: '44%', y: '8%', r: 6 },
  ]
  return (
    <div className="pop-hero" aria-hidden="true">
      <motion.img className="pop-plate" src={dishImage('momos')} alt="" draggable={false}
        initial={{ scale: 0, rotate: 90 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: delay + 0.4, type: 'spring', stiffness: 160, damping: 12 }}
        whileHover={{ rotate: 12, scale: 1.05 }} />
      {stickers.map((s, k) => (
        <motion.span key={s.t} className={`pop-sticker ${s.c} k${k}`} style={{ left: s.x, top: s.y }}
          drag dragConstraints={box} dragElastic={0.2} dragMomentum={false}
          whileDrag={{ scale: 1.15, rotate: 0, cursor: 'grabbing' }} whileHover={{ scale: 1.08 }}
          initial={{ scale: 0, rotate: s.r - 30 }} animate={{ scale: 1, rotate: s.r }}
          transition={{ delay: delay + 0.8 + k * 0.12, type: 'spring', stiffness: 300, damping: 12 }}>{s.t}</motion.span>
      ))}
      <small className="pop-hint">psst… drag the stickers</small>
    </div>
  )
}
