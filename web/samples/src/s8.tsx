import { animate, motion, useInView, type Variants } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { biz, cats, dishes, promises, rupee, M } from './data'
import { Btn, Reveal, Stagger, fadeUp, ease } from './kit'
import './s8.css'

const clip: Variants = { hidden: { clipPath: 'inset(0 0 100% 0)' }, show: { clipPath: 'inset(0 0 0% 0)', transition: { duration: 1.1, ease } } }
function Count({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null), seen = useInView(ref, { once: true })
  const [v, setV] = useState(0)
  useEffect(() => { if (seen) { const c = animate(0, to, { duration: 1.4, ease, onUpdate: n => setV(Math.round(n)) }); return () => c.stop() } }, [seen, to])
  return <span ref={ref}>{v}{suffix}</span>
}
export default function S8() {
  const [cat, setCat] = useState('All')
  return (
    <div className="s8">
      <nav className="s8-nav"><b>The Urban Bites</b><div><a href="#s8-menu">Menu</a><a href="#s8-visit">Visit</a><Btn className="s8-btn" href={`tel:${biz.phone}`}>Order</Btn></div></nav>
      <section className="s8-hero">
        <div>
          <motion.p className="s8-eye" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>Pure veg · Julana Bypass, Haryana</motion.p>
          <h1>{['Honest food,', 'served fast.'].map((l, k) => <span key={l} className="s8-mask"><motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: .1 + k * .12, duration: .9, ease }}>{k ? <em>{l}</em> : l}</motion.span></span>)}</h1>
          <motion.p className="s8-motto" lang="hi" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .5 }}>{biz.motto}</motion.p>
          <motion.div className="s8-cta" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .65 }}>
            <Btn className="s8-btn" href="#s8-menu">Order online</Btn><Btn className="s8-link" href={biz.maps} target="_blank">Get directions →</Btn>
          </motion.div>
        </div>
        <motion.div className="s8-himg" variants={clip} initial="hidden" animate="show"><motion.img src={M('counter.jpg')} alt="The Urban Bites counter" initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ duration: 1.6, ease }} /></motion.div>
      </section>
      <Stagger className="s8-stats" gap={.1}>
        <motion.div variants={fadeUp}><b><Count to={14} />+</b><span>dishes on the menu</span></motion.div>
        <motion.div variants={fadeUp}><b><Count to={12} /> hrs</b><span>open every day</span></motion.div>
        <motion.div variants={fadeUp}><b><Count to={5} /> km</b><span>free delivery radius</span></motion.div>
        <motion.div variants={fadeUp}><b>₹<Count to={500} /></b><span>minimum order</span></motion.div>
      </Stagger>
      <section className="s8-menu" id="s8-menu">
        <Reveal className="s8-head"><h2>Menu</h2><div className="s8-filter">{cats.map(c => <motion.button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)} whileHover={{ y: -1 }} whileTap={{ scale: .95 }}>{c}</motion.button>)}</div></Reveal>
        <motion.div className="s8-mlist" key={cat} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: .04 } } }}>
          {dishes.filter(d => cat === 'All' || d.cat === cat).map(d => (
            <motion.div key={d.id} variants={fadeUp} className="s8-row" whileHover="h">
              <motion.img src={d.img} alt="" variants={{ h: { scale: 1.08 } }} />
              <div><h3>{d.name}</h3><p>{d.note}</p></div>
              <div className="s8-price"><b>{rupee(d.full)}</b>{d.half && <small>Half ₹{d.half}</small>}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>
      <motion.section className="s8-strip" initial="hidden" whileInView="show" viewport={{ once: true, amount: .2 }} variants={{ hidden: {}, show: { transition: { staggerChildren: .12 } } }}>
        {[M('hut.jpg'), M('wok.jpg'), M('shed-trees.jpg')].map(s => <motion.div key={s} variants={clip}><img src={s} alt="" /></motion.div>)}
      </motion.section>
      <section className="s8-prom">
        <Reveal><h2>What we promise</h2></Reveal>
        <Stagger className="s8-pgrid" gap={.12}>{promises.map((p, k) => <motion.div key={p.t} variants={fadeUp} whileHover={{ y: -4, boxShadow: '0 16px 40px rgba(19,41,75,.1)' }}><span className="s8-num">0{k + 1}</span><h3>{p.t} <small lang="hi">{p.k}</small></h3><p>{p.d}</p></motion.div>)}</Stagger>
      </section>
      <section className="s8-visit" id="s8-visit">
        <Reveal className="s8-vcard"><h2>Visit us</h2><p>{biz.place}</p><p>{biz.hours}</p><p>Call <a href={`tel:${biz.phone}`}>{biz.phone}</a></p><Btn className="s8-btn" href={biz.maps} target="_blank">Open in Google Maps</Btn></Reveal>
        <motion.div className="s8-vimg" variants={clip} initial="hidden" whileInView="show" viewport={{ once: true }}><img src={M('night-huts-2.jpg')} alt="" /></motion.div>
      </section>
      <footer className="s8-foot"><b>The Urban Bites</b><span>© 2026 · Pure vegetarian</span></footer>
    </div>
  )
}
