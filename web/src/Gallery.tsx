import React, { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react'
import { media } from './menu'
import { MButton, Reveal } from './motion'

const photos = [
  { src: 'night-huts-2.jpg', title: 'Two huts, one blue glow', note: 'Bamboo cabins wired in LED, right off the bypass' },
  { src: 'banner.jpg', title: 'Tasty · Fresh · Hygienic', note: 'The four promises on every board' },
  { src: 'counter.jpg', title: 'The counter', note: 'Momos up front, cold drinks in the chiller' },
  { src: 'shed-bike.jpg', title: 'Park right at the table', note: 'Pull in, kill the engine, order' },
  { src: 'wok.jpg', title: 'Fired up to order', note: 'Every plate tossed on a roaring wok' },
  { src: 'parking.jpg', title: 'Room for cars and bikes', note: 'Big lot, bright lights' },
  { src: 'shed-trees.jpg', title: 'Open-air seating', note: 'Plastic chairs, night breeze, hot plates' },
  { src: 'menu-board.jpg', title: 'The full board', note: 'Every dish, full and half plates' },
  { src: 'hut.jpg', title: 'Find the glowing roof', note: 'You can see it from the road' },
]

// 3×3 photo collage. Tap a photo to see it large.
export default function Gallery() {
  const grid = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [lit, setLit] = useState(false)
  // Collage depth: the middle column drifts against the scroll on wider screens.
  const { scrollYProgress } = useScroll({ target: grid, offset: ['start end', 'end start'] })
  const drift = useTransform(scrollYProgress, [0, 1], [50, -50])
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 700px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 700px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (open == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => ((i ?? 0) + 1) % photos.length)
      if (e.key === 'ArrowLeft') setOpen((i) => ((i ?? 0) + photos.length - 1) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const cur = open == null ? null : photos[open]

  return (
    <section className="collage" aria-labelledby="collage-title">
      <Reveal className="collage-head">
        <p className="eyebrow">After dark on the bypass</p>
        <h2 id="collage-title">Under the blue lights</h2>
      </Reveal>
      <motion.div className={`collage-grid ${lit ? 'lit' : ''}`} ref={grid} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.25 }}>
        {photos.map((p, i) => (
          <Tile key={p.src} i={i} p={p} drift={wide && i % 3 === 1 ? drift : undefined} onOpen={() => setOpen(i)} onDone={i === 8 ? () => setLit(true) : undefined} lit={lit} />
        ))}
      </motion.div>

      {cur && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={cur.title} onClick={() => setOpen(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={media(cur.src)} alt={cur.title} />
            <figcaption><strong>{cur.title}</strong> · {cur.note}</figcaption>
          </figure>
          <MButton className="icon-btn lb-close" onClick={() => setOpen(null)} aria-label="Close">✕</MButton>
          <button className="icon-btn lb-prev" onClick={(e) => { e.stopPropagation(); setOpen((open! + photos.length - 1) % photos.length) }} aria-label="Previous photo">‹</button>
          <button className="icon-btn lb-next" onClick={(e) => { e.stopPropagation(); setOpen((open! + 1) % photos.length) }} aria-label="Next photo">›</button>
        </div>
      )}
    </section>
  )
}

// Each tile wipes open from a different side while its photo settles from a zoom; then a shine sweeps across.
const wipe = ['inset(0 100% 0 0)', 'inset(100% 0 0 0)', 'inset(0 0 0 100%)', 'inset(0 0 100% 0)']
const order = [4, 1, 3, 5, 7, 0, 2, 6, 8]
const expo = [0.16, 1, 0.3, 1] as const

function Tile({ i, p, drift, onOpen, onDone, lit }: {
  i: number; p: (typeof photos)[number]; drift?: MotionValue<number>; onOpen: () => void; onDone?: () => void; lit: boolean
}) {
  const at = order.indexOf(i) * 0.09
  // Pointer tilt and glare on devices with a mouse, eased by springs.
  const rx = useSpring(0, { stiffness: 200, damping: 18 })
  const ry = useSpring(0, { stiffness: 200, damping: 18 })
  const gx = useMotionValue('50%')
  const gy = useMotionValue('50%')
  function tilt(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    ry.set((x - 0.5) * 10)
    rx.set((0.5 - y) * 10)
    gx.set(`${x * 100}%`)
    gy.set(`${y * 100}%`)
  }
  return (
    <motion.button
      className="collage-tile"
      onClick={onOpen}
      onPointerMove={tilt}
      onPointerLeave={() => { rx.set(0); ry.set(0) }}
      aria-label={`View photo: ${p.title}`}
      style={{ y: drift, '--gx': gx, '--gy': gy } as unknown as React.CSSProperties}
      variants={{
        hidden: { clipPath: wipe[i % 4], rotate: i % 2 ? 2.5 : -2.5 },
        show: { clipPath: 'inset(0% 0% 0% 0%)', rotate: 0, transition: { delay: at, duration: 0.9, ease: expo } },
      }}
      onAnimationComplete={(def) => { if (def === 'show') onDone?.() }}
      whileTap={{ scale: 0.97 }}
    >
      <motion.span className="tile-inner" style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}>
        <motion.span className="tile-photo"
          variants={{ hidden: { scale: 1.35, filter: 'brightness(2) saturate(0)' }, show: { scale: 1, filter: 'brightness(1) saturate(1)', transition: { delay: at, duration: 1.2, ease: [0.33, 1, 0.68, 1] } } }}>
          {/* A slow Ken Burns drift keeps the collage alive; hovering zooms in a little more. */}
          <motion.img src={media(p.src)} alt="" loading="lazy"
            animate={{ scale: [1.02, 1.14], x: ['0%', '-2%'], y: ['0%', '-2%'] }}
            transition={{ duration: 14, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror', delay: -i * 1.7 }} />
        </motion.span>
        <motion.span className="tile-shine" initial={{ x: '-120%' }} animate={lit ? { x: '120%' } : undefined}
          transition={{ duration: 1.4, ease: 'easeOut', delay: (i % 3) * 0.12 + Math.floor(i / 3) * 0.12 }} />
        <span className="tile-glare" />
        <span className="collage-cap">
          <strong>{p.title}</strong>
          <small>{p.note}</small>
        </span>
      </motion.span>
    </motion.button>
  )
}
