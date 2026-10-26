import { AnimatePresence, motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
import { biz, dishes, promises, rupee, M } from './data'
import { Btn, Reveal, Stagger, fadeUp, ease } from './kit'
import './s4.css'

function Row({ text, dir }: { text: string; dir: 1 | -1 }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const x = useTransform(scrollYProgress, [0, 1], dir > 0 ? ['5%', '-45%'] : ['-45%', '5%'])
  return <div ref={ref} className="s4-row"><motion.div style={{ x }}>{text} {text} {text}</motion.div></div>
}
const line = { hidden: { y: '110%' }, show: (k: number) => ({ y: '0%', transition: { delay: .15 + k * .12, duration: .9, ease } }) }
export default function S4() {
  const [hover, setHover] = useState<string | null>(null)
  const mx = useMotionValue(0), my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 300, damping: 30 }), sy = useSpring(my, { stiffness: 300, damping: 30 })
  const img = dishes.find(d => d.id === hover)?.img
  return (
    <div className="s4">
      <nav className="s4-nav"><span>Vol. 01 — Julana Bypass</span><b>THE URBAN BITES</b><Btn href={`tel:${biz.phone}`}>Order ↗</Btn></nav>
      <header className="s4-hero">
        {['Fire.', 'Masala.', 'Highway.'].map((w, k) => (
          <div key={w} className="s4-mask"><motion.h1 custom={k} variants={line} initial="hidden" animate="show">{w}</motion.h1></div>
        ))}
        <motion.div className="s4-aside" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .8 }}>
          <p lang="hi">{biz.motto}</p>
          <p className="s4-small">A pure-veg roadside kitchen near Brahmanwas. Tandoor lit at 11, last order at 11.</p>
        </motion.div>
        <motion.img className="s4-heroimg" src={M('counter.jpg')} alt="" initial={{ clipPath: 'inset(100% 0 0 0)' }} animate={{ clipPath: 'inset(0% 0 0 0)' }} transition={{ delay: .4, duration: 1.2, ease }} />
      </header>
      <Row text="TANDOOR · CHAAP · MOMOS · CHAI ·" dir={1} />
      <Row text="FREE DELIVERY ABOVE ₹500 · 5 KM ·" dir={-1} />
      <section className="s4-menu" onPointerMove={e => { mx.set(e.clientX); my.set(e.clientY) }}>
        <Reveal className="s4-label"><span>§ 1</span><h2>The Menu</h2></Reveal>
        <ol>
          {dishes.map((d, k) => (
            <motion.li key={d.id} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .6, ease }}
              onPointerEnter={() => setHover(d.id)} onPointerLeave={() => setHover(null)} whileHover={{ x: 14 }}>
              <span className="n">{String(k + 1).padStart(2, '0')}</span>
              <div className="t"><h3>{d.name}</h3><small lang="hi">{d.hi}</small></div>
              <span className="c">{d.cat}</span>
              <b>{rupee(d.full)}</b>
            </motion.li>
          ))}
        </ol>
        <AnimatePresence>
          {img && <motion.img key={img} className="s4-float" src={img} alt="" style={{ left: sx, top: sy }} initial={{ opacity: 0, scale: .6, rotate: -6 }} animate={{ opacity: 1, scale: 1, rotate: 3 }} exit={{ opacity: 0, scale: .6 }} />}
        </AnimatePresence>
      </section>
      <section className="s4-prom">
        <Reveal className="s4-label"><span>§ 2</span><h2>Three promises</h2></Reveal>
        <Stagger className="s4-cols" gap={.15}>
          {promises.map(p => <motion.div key={p.t} variants={fadeUp}><b lang="hi">{p.k}</b><h4>{p.t}</h4><p>{p.d}</p></motion.div>)}
        </Stagger>
      </section>
      <section className="s4-visit">
        <Reveal className="s4-label"><span>§ 3</span><h2>Come by</h2></Reveal>
        <div className="s4-vgrid">
          <Reveal><img src={M('shed-trees.jpg')} alt="The Urban Bites seating" /></Reveal>
          <Reveal className="s4-vt"><p className="big">{biz.place}.</p><p>{biz.hours}. Call {biz.phone}.</p><Btn className="s4-link" href={biz.maps} target="_blank">Directions ↗</Btn></Reveal>
        </div>
      </section>
      <footer className="s4-foot"><b>THE URBAN BITES</b><span>© 2026</span></footer>
    </div>
  )
}
