import { motion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef } from 'react'
import { biz, dishes, promises, rupee, M } from './data'
import { Btn, Reveal, Stagger, fadeUp, slideL } from './kit'
import './s7.css'

const chapters = [
  { n: '०१', hi: 'आग', en: 'It starts with fire', p: 'Every evening the tandoor is lit at Julana Bypass. Coal, clay and patience.', media: { v: M('flame.mp4'), poster: M('flame-poster.jpg') } },
  { n: '०२', hi: 'रसोई', en: 'Then the kitchen', p: 'Masalas ground in the morning. Paneer delivered fresh. Oil changed every single day.', media: { img: M('wok.jpg') } },
  { n: '०३', hi: 'थाली', en: 'Then your plate', p: 'Paneer tikka off the skewer, chaap in rich gravy, momos with fiery chutney.', media: { img: dishes[1].img } },
  { n: '०४', hi: 'आप', en: 'And then, you', p: 'Pull over under the lights, or order online with free delivery above ₹500.', media: { img: M('night-huts.jpg') } },
]
function Chapter({ c, k }: { c: typeof chapters[number]; k: number }) {
  const ref = useRef(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const scale = useTransform(p, [0, .6], [.55, 1])
  const radius = useTransform(p, [0, .6], [48, 0])
  const ty = useTransform(p, [0, .25, .8, 1], [60, 0, 0, -40])
  const op = useTransform(p, [0, .2, .85, 1], [0, 1, 1, 0])
  return (
    <section ref={ref} className="s7-ch">
      <div className="s7-sticky">
        <motion.div className="s7-media" style={{ scale, borderRadius: radius }}>
          {c.media.v ? <video src={c.media.v} poster={c.media.poster} autoPlay muted loop playsInline /> : <img src={c.media.img} alt="" />}
        </motion.div>
        <motion.div className="s7-text" style={{ y: ty, opacity: op }}>
          <span className="s7-n">{c.n}</span><h2 lang="hi">{c.hi}</h2><h3>{c.en}</h3><p>{c.p}</p>
          {k === 3 && <div className="s7-cta"><Btn className="s7-btn" href="#s7-menu">Order now</Btn><Btn className="s7-btn ghost" href={biz.maps} target="_blank">Directions</Btn></div>}
        </motion.div>
        <Progress p={p} k={k} />
      </div>
    </section>
  )
}
function Progress({ p, k }: { p: MotionValue<number>; k: number }) {
  return <div className="s7-prog">{chapters.map((_, i) => <span key={i}>{i === k ? <motion.i style={{ scaleX: p }} /> : <i style={{ transform: `scaleX(${i < k ? 1 : 0})` }} />}</span>)}</div>
}
export default function S7() {
  return (
    <div className="s7">
      <header className="s7-intro">
        <motion.img src="brand/mark-256.png" alt="" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 14 }} />
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}>The Urban Bites</motion.h1>
        <motion.p lang="hi" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .6 }}>{biz.motto}</motion.p>
        <motion.span className="s7-scroll" animate={{ y: [0, 10, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>Scroll the story ↓</motion.span>
      </header>
      {chapters.map((c, k) => <Chapter key={k} c={c} k={k} />)}
      <section className="s7-menu" id="s7-menu">
        <Reveal><h2>The menu</h2></Reveal>
        <Stagger className="s7-list" gap={.05}>
          {dishes.map(d => (
            <motion.div key={d.id} variants={slideL} className="s7-item" whileHover={{ x: 8, backgroundColor: 'rgba(255,190,110,.08)' }}>
              <img src={d.img} alt="" /><div><b>{d.name}</b> <span lang="hi">{d.hi}</span><small>{d.note}</small></div><em>{rupee(d.full)}</em>
            </motion.div>
          ))}
        </Stagger>
      </section>
      <section className="s7-prom">
        <Stagger className="s7-pgrid" gap={.15}>{promises.map(p => <motion.div key={p.t} variants={fadeUp} whileHover={{ y: -6 }}><b lang="hi">{p.k}</b><span>{p.t}</span><p>{p.d}</p></motion.div>)}</Stagger>
      </section>
      <footer className="s7-foot"><p>{biz.place} · {biz.hours}</p><Btn className="s7-btn" href={`tel:${biz.phone}`}>Call {biz.phone}</Btn><small>© The Urban Bites</small></footer>
    </div>
  )
}
