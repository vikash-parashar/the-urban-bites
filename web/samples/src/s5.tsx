import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { biz, cats, dishes, promises, regulars, rupee, M } from './data'
import { Btn, Reveal, Stagger, fadeUp, spring } from './kit'
import './s5.css'

function Glass({ children, className = '' }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(.5), y = useMotionValue(.5)
  const rx = useSpring(useTransform(y, [0, 1], [10, -10]), { stiffness: 180, damping: 16 })
  const ry = useSpring(useTransform(x, [0, 1], [-10, 10]), { stiffness: 180, damping: 16 })
  const gx = useTransform(x, v => `${v * 100}%`), gy = useTransform(y, v => `${v * 100}%`)
  const bg = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgba(232,193,106,.22), transparent 55%)`
  return (
    <motion.div variants={fadeUp} className={`s5-glass ${className}`} style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000 }}
      onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height) }}
      onPointerLeave={() => { x.set(.5); y.set(.5) }}>
      <motion.span className="s5-sheen" style={{ background: bg }} />{children}
    </motion.div>
  )
}
export default function S5() {
  const [cat, setCat] = useState('Tandoor')
  const sx = useMotionValue(50), sy = useMotionValue(40)
  const spot = useMotionTemplate`radial-gradient(600px circle at ${sx}% ${sy}%, rgba(232,193,106,.18), transparent 60%)`
  return (
    <div className="s5">
      <nav className="s5-nav"><span className="s5-mono">TUB</span><div><a href="#s5-menu">Menu</a><a href="#s5-visit">Visit</a></div><Btn className="s5-gold" href={`tel:${biz.phone}`}>Reserve · {biz.phone}</Btn></nav>
      <section className="s5-hero" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); sx.set((e.clientX - r.left) / r.width * 100); sy.set((e.clientY - r.top) / r.height * 100) }}>
        <motion.img src={M('night-huts-2.jpg')} alt="" initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: .45 }} transition={{ duration: 2 }} />
        <motion.div className="s5-spot" style={{ background: spot }} />
        <div className="s5-hin">
          <motion.p className="s5-eyebrow" initial={{ opacity: 0, letterSpacing: '.8em' }} animate={{ opacity: 1, letterSpacing: '.4em' }} transition={{ duration: 1.4 }}>EST. JULANA BYPASS</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3, duration: 1 }}>The <i>Urban</i> Bites</motion.h1>
          <motion.div className="s5-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: .8, duration: 1 }} />
          <motion.p className="s5-motto" lang="hi" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>{biz.motto}</motion.p>
          <motion.div className="s5-cta" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }}>
            <Btn className="s5-gold" href="#s5-menu">Explore the menu</Btn><Btn className="s5-line" href={biz.maps} target="_blank">Find us</Btn>
          </motion.div>
        </div>
      </section>
      <Stagger className="s5-trio" gap={.15}>
        <Glass><small>Tonight’s offer</small><h3>{biz.offer.title}</h3><p>{biz.offer.sub}</p></Glass>
        <Glass><small>Hours</small><h3>11 AM – 11 PM</h3><p>Every day, tandoor fired till close</p></Glass>
        <Glass><small>Kitchen</small><h3>100% vegetarian</h3><p>Fresh paneer, daily-changed oil</p></Glass>
      </Stagger>
      <section className="s5-menu" id="s5-menu">
        <Reveal className="s5-h"><small>La carte</small><h2>The Menu</h2></Reveal>
        <div className="s5-tabs">
          {cats.slice(1).map(c => (
            <button key={c} onClick={() => setCat(c)} className={c === cat ? 'on' : ''}>{c}{c === cat && <motion.i layoutId="s5-u" transition={spring} />}</button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={cat} className="s5-mgrid" initial="hidden" animate="show" exit={{ opacity: 0, y: -10 }} variants={{ hidden: {}, show: { transition: { staggerChildren: .08 } } }}>
            {dishes.filter(d => d.cat === cat).map(d => (
              <Glass key={d.id} className="s5-dish"><img src={d.img} alt="" /><div className="s5-dt"><h4>{d.name}</h4><span className="s5-dots" /><b>{rupee(d.full)}</b></div><p>{d.note}{d.half ? ` · Half ₹${d.half}` : ''}</p></Glass>
            ))}
          </motion.div>
        </AnimatePresence>
      </section>
      <section className="s5-prom">
        <Reveal className="s5-h"><small>Our word</small><h2>Three promises</h2></Reveal>
        <Stagger className="s5-trio" gap={.15}>{promises.map(p => <Glass key={p.t}><b lang="hi">{p.k}</b><h3>{p.t}</h3><p>{p.d}</p></Glass>)}</Stagger>
      </section>
      <section className="s5-fame">
        <Reveal className="s5-h"><small>Honoured guests</small><h2>Wall of Fame</h2></Reveal>
        <Stagger className="s5-names" gap={.2}>{regulars.map((r, k) => <motion.div key={r.n} variants={fadeUp} whileHover={{ scale: 1.05 }}><span>{['I', 'II', 'III'][k]}</span><b>{r.n}</b><small>{r.v} visits</small></motion.div>)}</Stagger>
      </section>
      <section className="s5-visit" id="s5-visit">
        <Reveal className="s5-vimg"><img src={M('night-huts.jpg')} alt="The Urban Bites at night" /></Reveal>
        <Reveal className="s5-vt"><small>Visit</small><h2>Under the lights</h2><p>{biz.place}</p><Btn className="s5-gold" href={biz.maps} target="_blank">Directions</Btn></Reveal>
      </section>
      <footer className="s5-foot">The Urban Bites · Since 2026 · Pure Veg</footer>
    </div>
  )
}
