import { motion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { biz, dishes, promises, regulars, rupee, M } from './data'
import { Btn, Reveal, Stagger, fadeUp, slideL, slideR, pop, alive } from './kit'
import './s1.css'

const words = ['THE', 'URBAN', 'BITES']
export default function S1() {
  const hero = useRef(null)
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] })
  const vy = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  const track = useRef<HTMLDivElement>(null)
  return (
    <div className="s1">
      <nav className="s1-nav">
        <span className="s1-logo">TUB<i>•</i></span>
        <div><a href="#s1-menu">Menu</a><a href="#s1-visit">Visit</a><Btn className="s1-call" href={`tel:${biz.phone}`}>Call {biz.phone}</Btn></div>
      </nav>
      <section className="s1-hero" ref={hero}>
        <motion.video style={{ y: vy }} src={M('flame.mp4')} poster={M('flame-poster.jpg')} autoPlay muted loop playsInline />
        <motion.div className="s1-hero-in" style={{ opacity: fade }}>
          <motion.p className="s1-kicker" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }}>Highway kitchen · Open till 11 PM</motion.p>
          <h1 aria-label="The Urban Bites">
            {words.map((w, wi) => (
              <span key={w} className="s1-word">{w.split('').map((l, k) => (
                <motion.span key={k} initial={{ opacity: 0, y: 60, filter: 'blur(8px)' }} animate={{ opacity: [0, 1, .3, 1], y: 0, filter: 'blur(0px)' }} transition={{ delay: .3 + (wi * 5 + k) * .05, duration: .9 }}>{l}</motion.span>
              ))}</span>
            ))}
          </h1>
          <motion.p className="s1-motto" lang="hi" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>{biz.motto}</motion.p>
          <motion.div className="s1-cta" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }}>
            <Btn className="s1-btn hot" href="#s1-menu">Order now</Btn>
            <Btn className="s1-btn" href={biz.maps} target="_blank">Get directions</Btn>
          </motion.div>
        </motion.div>
      </section>
      <div className="s1-marquee" aria-label={biz.offer.title}>
        <motion.div animate={{ x: ['0%', '-50%'] }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}>
          {Array.from({ length: 8 }).map((_, k) => <span key={k}>{biz.offer.title} ✦ {biz.offer.sub} ✦ </span>)}
        </motion.div>
      </div>
      <section className="s1-menu" id="s1-menu">
        <Reveal className="s1-head"><h2>Tonight’s <em>line-up</em></h2><p>Drag the reel →</p></Reveal>
        <div className="s1-track" ref={track}>
          <motion.div className="s1-reel" drag="x" dragConstraints={track} dragElastic={0.12}>
            {dishes.slice(0, 10).map((d, k) => (
              <motion.article key={d.id} className="s1-card" initial={{ opacity: 0, x: 80 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: k * .06, duration: .6 }} whileHover={{ y: -10, rotate: -1.5 }}>
                <div className="s1-img"><img src={d.img} alt="" draggable={false} /></div>
                <h3>{d.name}</h3><small lang="hi">{d.hi}</small>
                <div className="s1-row"><b>{rupee(d.full)}</b><motion.button {...alive} className="s1-add">+ Add</motion.button></div>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>
      <section className="s1-promise">
        <Reveal className="s1-head"><h2>Our <em>promise</em></h2></Reveal>
        <div className="s1-pgrid">
          {promises.map((p, k) => (
            <Reveal key={p.t} v={k % 2 ? slideR : slideL} className="s1-pcard"><span lang="hi">{p.k}</span><h3>{p.t}</h3><p>{p.d}</p></Reveal>
          ))}
        </div>
      </section>
      <section className="s1-fame">
        <Reveal className="s1-head"><h2>Wall of <em>fame</em></h2><p>Our most regular faces this month</p></Reveal>
        <Stagger className="s1-pod" gap={.15}>
          {[regulars[1], regulars[0], regulars[2]].map((r, k) => (
            <motion.div key={r.n} variants={pop} className={`s1-step p${k}`}><b>{r.n}</b><span>{r.v} visits</span></motion.div>
          ))}
        </Stagger>
      </section>
      <section className="s1-visit" id="s1-visit">
        <Reveal v={slideL} className="s1-vimg"><img src={M('night-huts.jpg')} alt="The Urban Bites at night" /></Reveal>
        <Reveal v={slideR} className="s1-vtext">
          <h2>Find the <em>glow</em></h2><p>{biz.place}</p><p>{biz.hours}</p>
          <div className="s1-cta"><Btn className="s1-btn hot" href={biz.maps} target="_blank">Open in Maps</Btn><Btn className="s1-btn" href={`tel:${biz.phone}`}>Call</Btn></div>
        </Reveal>
      </section>
      <motion.footer className="s1-foot" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>© The Urban Bites · Pure veg · Julana Bypass</motion.footer>
    </div>
  )
}
