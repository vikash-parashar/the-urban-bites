import { AnimatePresence, motion, LayoutGroup } from 'motion/react'
import { useMemo, useState } from 'react'
import { biz, cats, dishes, promises, rupee, M } from './data'
import { useCart } from './useCart'
import { Btn, Reveal, Stagger, fadeUp, spring } from './kit'
import './s2.css'

export default function S2() {
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const cart = useCart()
  const list = useMemo(() => dishes.filter(d => (cat === 'All' || d.cat === cat) && d.name.toLowerCase().includes(q.toLowerCase())), [cat, q])
  const left = Math.max(0, 500 - cart.total)
  return (
    <div className="s2">
      <header className="s2-top">
        <div className="s2-brand"><img src="brand/mark-256.png" alt="" /><div><b>The Urban Bites</b><small>📍 Julana Bypass · 20–30 min</small></div></div>
        <Btn className="s2-call" href={`tel:${biz.phone}`} aria-label="Call the shop">📞</Btn>
      </header>
      <div className="s2-wrap">
        <motion.label className="s2-search" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <span>🔍</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search paneer, momos, chai…" />
        </motion.label>
        <motion.div className="s2-offer" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .1 }} whileHover={{ scale: 1.01 }}>
          <div><small>OFFER OF THE DAY</small><h2>{biz.offer.title}</h2><p>{biz.offer.sub} · 100% veg</p></div>
          <motion.img src={M('wok.jpg')} alt="" animate={{ rotate: [0, -3, 0, 3, 0] }} transition={{ duration: 6, repeat: Infinity }} />
        </motion.div>
        <p className="s2-motto" lang="hi">{biz.motto}</p>
        <LayoutGroup>
          <div className="s2-chips" role="tablist">
            {cats.map(c => (
              <motion.button key={c} role="tab" aria-selected={c === cat} className={c === cat ? 'on' : ''} onClick={() => setCat(c)} whileTap={{ scale: .92 }}>
                {c === cat && <motion.span layoutId="s2-chip" className="s2-chipbg" transition={spring} />}<span>{c}</span>
              </motion.button>
            ))}
          </div>
        </LayoutGroup>
        <motion.ul className="s2-list" layout>
          <AnimatePresence mode="popLayout">
            {list.map((d, k) => (
              <motion.li key={d.id} layout initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0, transition: { delay: k * .04 } }} exit={{ opacity: 0, scale: .9 }} className="s2-item">
                <div className="s2-txt">
                  <span className="s2-veg" aria-label="Veg" />{d.tag && <span className="s2-tag">★ {d.tag}</span>}
                  <h3>{d.name}</h3>
                  <b>{rupee(d.full)}{d.half && <small> · Half ₹{d.half}</small>}</b>
                  <p>{d.note}</p>
                </div>
                <div className="s2-pic">
                  <motion.img src={d.img} alt="" whileHover={{ scale: 1.06 }} />
                  <div className="s2-addwrap">
                    <AnimatePresence mode="wait" initial={false}>
                      {!cart.c[d.id] ? (
                        <motion.button key="a" className="s2-add" disabled={d.full == null} onClick={() => cart.add(d.id)} initial={{ scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .7, opacity: 0 }} whileHover={{ y: -2 }} whileTap={{ scale: .9 }}>{d.full == null ? 'AT SHOP' : 'ADD'}</motion.button>
                      ) : (
                        <motion.div key="s" className="s2-step" initial={{ scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .7, opacity: 0 }}>
                          <motion.button whileTap={{ scale: .8 }} onClick={() => cart.add(d.id, -1)} aria-label="Remove one">−</motion.button>
                          <AnimatePresence mode="popLayout"><motion.b key={cart.c[d.id]} initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}>{cart.c[d.id]}</motion.b></AnimatePresence>
                          <motion.button whileTap={{ scale: .8 }} onClick={() => cart.add(d.id)} aria-label="Add one">+</motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
        <Stagger className="s2-prom">
          {promises.map(p => <motion.div key={p.t} variants={fadeUp} whileHover={{ y: -4 }}><b lang="hi">{p.k}</b><span>{p.t}</span><p>{p.d}</p></motion.div>)}
        </Stagger>
        <Reveal className="s2-visit">
          <img src={M('hut.jpg')} alt="The Urban Bites cart" />
          <div><h3>Pick up or dine at the cart</h3><p>{biz.place}<br />{biz.hours}</p><Btn className="s2-ghost" href={biz.maps} target="_blank">Directions →</Btn></div>
        </Reveal>
        <footer className="s2-foot">© The Urban Bites · Pure veg</footer>
      </div>
      <AnimatePresence>
        {cart.count > 0 && (
          <motion.div className="s2-cart" initial={{ y: 120 }} animate={{ y: 0 }} exit={{ y: 120 }} transition={spring}>
            <div className="s2-bar"><motion.i animate={{ width: `${Math.min(100, cart.total / 5)}%` }} /></div>
            <div className="s2-cartrow">
              <div><b>{cart.count} item{cart.count > 1 ? 's' : ''} · ₹{cart.total}</b><small>{left ? `Add ₹${left} more to order (min ₹500)` : '🎉 Free delivery unlocked'}</small></div>
              <motion.button className="s2-go" whileHover={{ scale: 1.04 }} whileTap={{ scale: .95 }}>View cart →</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
