import { motion, useMotionValue, useSpring, useTransform, type Variants } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { biz, dishes, promises, regulars, rupee, M, photos } from './data'
import { Btn, Stagger, Reveal } from './kit'
import './s3.css'

const tile: Variants = { hidden: { opacity: 0, y: 40, scale: .95 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 140, damping: 18 } } }
function Tile({ children, className = '' }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(0), y = useMotionValue(0)
  const rx = useSpring(useTransform(y, [-.5, .5], [6, -6]), { stiffness: 200, damping: 18 })
  const ry = useSpring(useTransform(x, [-.5, .5], [-6, 6]), { stiffness: 200, damping: 18 })
  return (
    <motion.div variants={tile} className={`s3-t ${className}`} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width - .5); y.set((e.clientY - r.top) / r.height - .5) }}
      onPointerLeave={() => { x.set(0); y.set(0) }} whileHover={{ scale: 1.015 }}>
      {children}
    </motion.div>
  )
}
function useOpen() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => { const i = setInterval(() => setT(new Date()), 30000); return () => clearInterval(i) }, [])
  const ist = new Date(t.getTime() + (t.getTimezoneOffset() + 330) * 60000)
  const h = ist.getHours()
  return { open: h >= 11 && h < 23, time: ist.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) }
}
export default function S3() {
  const o = useOpen()
  const [pi, setPi] = useState(0)
  useEffect(() => { const i = setInterval(() => setPi(p => (p + 1) % photos.length), 2600); return () => clearInterval(i) }, [])
  return (
    <div className="s3">
      <nav className="s3-nav"><b>The Urban Bites</b><Btn className="s3-pill" href="#s3-menu">Order online</Btn></nav>
      <Stagger className="s3-grid" gap={.07}>
        <Tile className="hero"><video src={M('walkthrough.mp4')} poster={M('walkthrough-poster.jpg')} autoPlay muted loop playsInline /><div className="s3-hcap"><h1>Desi street food,<br />done properly.</h1><Btn className="s3-pill dark" href="#s3-menu">See the menu</Btn></div></Tile>
        <Tile className="motto"><img src="brand/mark-256.png" alt="" /><p lang="hi">{biz.motto}</p></Tile>
        <Tile className="open"><motion.span className="dot" animate={{ scale: [1, 1.6, 1], opacity: [1, .4, 1] }} transition={{ duration: 1.6, repeat: Infinity }} data-open={o.open} /><b>{o.open ? 'Open now' : 'Closed now'}</b><small>{o.time} IST · 11 AM – 11 PM</small></Tile>
        <Tile className="offer"><small>Offer of the day</small><h2>Free delivery</h2><p>within 5 km on orders above ₹500</p><motion.span className="big" animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>🛵</motion.span></Tile>
        {dishes.slice(0, 3).map(d => (
          <Tile key={d.id} className="dish"><img src={d.img} alt="" /><div><h3>{d.name}</h3><b>{rupee(d.full)}</b></div></Tile>
        ))}
        <Tile className="gal"><motion.img key={pi} src={photos[pi]} alt="" initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .8 }} /><span>Inside the cart</span></Tile>
        <Tile className="prom"><h3>Our promise</h3>{promises.map(p => <div key={p.t}><b lang="hi">{p.k}</b><span>{p.d}</span></div>)}</Tile>
        <Tile className="fame"><h3>Regulars</h3>{regulars.map((r, k) => <div key={r.n}><span>{['🥇', '🥈', '🥉'][k]} {r.n}</span><motion.i initial={{ width: 0 }} whileInView={{ width: `${r.v * 2}%` }} viewport={{ once: true }} transition={{ delay: .3 + k * .15, duration: .8 }} /><small>{r.v}</small></div>)}</Tile>
        <Tile className="call"><small>Call to order</small><Btn href={`tel:${biz.phone}`}>{biz.phone}</Btn></Tile>
        <Tile className="map"><img src={M('parking.jpg')} alt="" /><div><b>Julana Bypass</b><small>near Brahmanwas</small><Btn className="s3-pill" href={biz.maps} target="_blank">Directions</Btn></div></Tile>
      </Stagger>
      <section id="s3-menu" className="s3-menu">
        <Reveal><h2>The full board</h2></Reveal>
        <Stagger className="s3-mgrid" gap={.05}>
          {dishes.map(d => (
            <motion.div key={d.id} variants={tile} className="s3-m" whileHover={{ y: -6 }}>
              <img src={d.img} alt="" /><div><h4>{d.name}</h4><small>{d.note}</small></div><motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: .9 }}>{rupee(d.full)}</motion.button>
            </motion.div>
          ))}
        </Stagger>
      </section>
      <footer className="s3-foot">© The Urban Bites · Julana Bypass, Haryana</footer>
    </div>
  )
}
