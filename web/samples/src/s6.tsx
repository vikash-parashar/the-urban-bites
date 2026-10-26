import { motion } from 'motion/react'
import { useRef } from 'react'
import { biz, dishes, promises, regulars, rupee, M } from './data'
import { Btn, Stagger, pop, view } from './kit'
import './s6.css'

const stickers = [
  { t: '100% VEG', c: 'g', x: '6%', y: '14%', r: -12 },
  { t: 'HOT 🔥', c: 'p', x: '78%', y: '10%', r: 10 },
  { t: 'FREE DELIVERY >₹500', c: 'c', x: '68%', y: '74%', r: -6 },
  { t: 'TANDOOR FRESH', c: 'w', x: '4%', y: '76%', r: 8 },
]
const card = { hidden: { opacity: 0, y: 60, rotate: 0 }, show: (k: number) => ({ opacity: 1, y: 0, rotate: k % 2 ? 2 : -2, transition: { type: 'spring' as const, stiffness: 220, damping: 14 } }) }
export default function S6() {
  const box = useRef<HTMLDivElement>(null)
  return (
    <div className="s6">
      <nav className="s6-nav"><b>THE URBAN BITES</b><Btn className="s6-btn p" href={`tel:${biz.phone}`}>CALL NOW</Btn></nav>
      <section className="s6-hero" ref={box}>
        <motion.h1 initial={{ scale: .4, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: -3 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
          THE<br /><span>URBAN</span><br />BITES
        </motion.h1>
        <motion.img className="s6-plate" src={dishes[0].img} alt="" initial={{ scale: 0, rotate: 90 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: .3, type: 'spring', stiffness: 160, damping: 12 }} whileHover={{ rotate: 12, scale: 1.05 }} />
        <motion.p className="s6-motto" lang="hi" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .6 }}>{biz.motto}</motion.p>
        {stickers.map((s, k) => (
          <motion.span key={s.t} className={`s6-st ${s.c}`} style={{ left: s.x, top: s.y }} drag dragConstraints={box} dragElastic={.2} whileDrag={{ scale: 1.15, rotate: 0, cursor: 'grabbing' }} whileHover={{ scale: 1.08 }}
            initial={{ scale: 0, rotate: s.r - 30 }} animate={{ scale: 1, rotate: s.r }} transition={{ delay: .7 + k * .12, type: 'spring', stiffness: 300, damping: 12 }}>{s.t}</motion.span>
        ))}
        <small className="s6-hint">psst… drag the stickers</small>
      </section>
      <div className="s6-tape"><motion.div animate={{ x: ['0%', '-50%'] }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}>{Array.from({ length: 10 }).map((_, k) => <span key={k}>MOMOS ★ CHAAP ★ PANEER TIKKA ★ CHAI ★ </span>)}</motion.div></div>
      <section className="s6-menu">
        <motion.h2 variants={pop} {...view}>WHAT’S COOKING</motion.h2>
        <Stagger className="s6-grid" gap={.06}>
          {dishes.map((d, k) => (
            <motion.article key={d.id} custom={k} variants={card} className={`s6-card c${k % 4}`} whileHover={{ rotate: 0, y: -6, boxShadow: '12px 12px 0 #111' }} whileTap={{ scale: .97 }}>
              <img src={d.img} alt="" />{d.tag && <span className="s6-tag">{d.tag}</span>}
              <h3>{d.name}</h3><p>{d.note}</p>
              <div><b>{rupee(d.full)}</b><motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: .85, rotate: -8 }}>ADD +</motion.button></div>
            </motion.article>
          ))}
        </Stagger>
      </section>
      <section className="s6-prom">
        <motion.h2 variants={pop} {...view}>PINKY PROMISE</motion.h2>
        <Stagger className="s6-pgrid" gap={.12}>{promises.map((p, k) => <motion.div key={p.t} variants={pop} className={`s6-pc c${k}`} whileHover={{ rotate: k % 2 ? -3 : 3, scale: 1.04 }}><b lang="hi">{p.k}</b><h3>{p.t}</h3><p>{p.d}</p></motion.div>)}</Stagger>
      </section>
      <section className="s6-fame">
        <motion.h2 variants={pop} {...view}>LEGENDS 👑</motion.h2>
        <Stagger className="s6-legends" gap={.15}>{regulars.map((r, k) => <motion.div key={r.n} variants={pop} whileHover={{ y: -8, rotate: 0 }} style={{ rotate: (k - 1) * 4 }}><span>#{k + 1}</span><b>{r.n}</b><small>{r.v} visits</small></motion.div>)}</Stagger>
      </section>
      <section className="s6-visit">
        <motion.div className="s6-polaroid" initial={{ rotate: -20, opacity: 0, y: 60 }} whileInView={{ rotate: -4, opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 120, damping: 12 }}><img src={M('hut.jpg')} alt="The Urban Bites cart" /><span>find us here!</span></motion.div>
        <motion.div className="s6-vt" initial={{ opacity: 0, x: 60 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
          <h2>PULL OVER!</h2><p>{biz.place}<br />{biz.hours}</p><Btn className="s6-btn c" href={biz.maps} target="_blank">TAKE ME THERE →</Btn>
        </motion.div>
      </section>
      <footer className="s6-foot">© THE URBAN BITES — made with masala</footer>
    </div>
  )
}
