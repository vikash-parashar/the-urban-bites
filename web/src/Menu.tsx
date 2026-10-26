import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { lift, MButton, Reveal, slideIn, spring, stagger } from './motion'
import { categories as bundled, dishImage, rupees, type Category, type MenuItem, type Size } from './menu'
import { offerPrice, registerMenu, type Cart } from './cart'
import { fetchMenu } from './api'
import { categoryEmoji, itemKind } from './kit'

// offersVersion changes when today's offers load, so offer prices re-render.
export default function Menu({ cart, offersVersion }: { cart: Cart; offersVersion: number }) {
  const [categories, setCategories] = useState<Category[]>(bundled)
  const [active, setActive] = useState(bundled[0].id)
  const [query, setQuery] = useState('')
  const category = categories.find((c) => c.id === active) ?? categories[0]
  const q = query.trim().toLowerCase()
  const shown = q
    ? categories.flatMap((c) => c.items).filter((i) => i.name.toLowerCase().includes(q) || i.name_hi.includes(query.trim()))
    : category.items

  useEffect(() => {
    fetchMenu()
      .then((live) => {
        if (!live?.length) return
        registerMenu(live)
        setCategories(live)
      })
      .catch(() => {
        /* offline: keep the bundled menu */
      })
  }, [])


  return (
    <section className="menu" id="menu" aria-labelledby="menu-title">
      <Reveal className="menu-head">
        <p className="eyebrow">The board, now online</p>
        <h2 id="menu-title">Menu</h2>
        <p className="menu-sub">Full and half plates, same prices as the board at the cart.</p>
      </Reveal>

      <div className="menu-search">
        <label htmlFor="menu-q" className="sr-only">Search the menu</label>
        <input id="menu-q" type="search" placeholder="Search: chaap, momos, chai…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="tabs" role="tablist" aria-label="Menu sections" hidden={!!q}>
        {categories.map((c) => (
          <MButton
            key={c.id}
            role="tab"
            id={`tab-${c.id}`}
            aria-selected={c.id === active}
            aria-controls="menu-panel"
            className="tab"
            onClick={() => setActive(c.id)}
          >
            <span><i className="tab-emoji" aria-hidden="true">{categoryEmoji[c.id] ?? itemKind(c.items[0]?.name ?? '', c.name).emoji}</i>{c.name}</span>
            <small lang="hi">{c.name_hi}</small>
          </MButton>
        ))}
      </div>

      {/* Cards slide in one after another when the menu scrolls into view and whenever the section changes. */}
      <motion.div key={q ? 'search' : active} className="dishes" id="menu-panel" role={q ? 'region' : 'tabpanel'} aria-labelledby={q ? undefined : `tab-${active}`} aria-label={q ? 'Search results' : undefined} data-offers={offersVersion}
        initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.05 }} variants={stagger(0.05)}>
        {shown.map((item) => (
          <Dish key={item.id} item={item} cart={cart} category={categories.find((c) => c.items.includes(item))?.name ?? ''} />
        ))}
        {q && shown.length === 0 && (
          <p className="menu-sub">Nothing called "{query.trim()}" on the board. Try another word, or call us and ask.</p>
        )}
      </motion.div>
    </section>
  )
}

const TAG_LABEL: Record<string, string> = { bestseller: '🔥 Bestseller', new: '✨ New', spicy: '🌶️ Spicy', chef: '👨‍🍳 Chef’s special' }

function Dish({ item, cart, category }: { item: MenuItem; cart: Cart; category: string }) {
  const kind = itemKind(item.name, category)
  const [size, setSize] = useState<Size>('full')
  const offer = offerPrice(item)
  const price = size === 'half' ? item.half : offer ?? item.full
  const qty = cart.qtyOf(item.id, size)
  const orderable = price != null

  return (
    <motion.article className={`dish ${offer != null ? 'has-offer' : ''}`} variants={slideIn} {...lift}>
      {offer != null && <span className="offer-tag">Offer</span>}
      {item.tag && (
        <motion.span className={`dish-tag tag-${item.tag}`} variants={{ hidden: { scale: 0, rotate: -20 }, show: { scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 380, damping: 14, delay: 0.25 } } }}>{TAG_LABEL[item.tag]}</motion.span>
      )}
      {item.image ? (
        <div className="dish-img">
          <img src={dishImage(item.image)} alt="" loading="lazy" />
          <span className={`dish-badge ${kind.drink ? 'drink' : ''}`} aria-hidden="true">{kind.emoji}</span>
        </div>
      ) : (
        <div className={`dish-img dish-tile ${kind.drink ? 'drink' : ''}`} aria-hidden="true">
          <span className="dish-tile-emoji">{kind.emoji}</span>
          <span>{item.name.replace(/\s+\d.*$/, '')}</span>
        </div>
      )}
      <div className="dish-body">
        <p className="dish-hi" lang="hi">
          <span className={`kind-tag ${kind.drink ? 'drink' : ''}`}>{kind.drink ? '🥤 Drink' : '🍽️ Food'}</span>
          {item.name_hi}
        </p>
        <h3>{item.name}</h3>
        {item.description && <p className="dish-desc">{item.description}</p>}
        {item.half != null && (
          <div className="sizes" role="radiogroup" aria-label={`${item.name} plate size`}>
            {(['full', 'half'] as const).map((s) => (
              <MButton
                key={s}
                role="radio"
                aria-checked={size === s}
                className="size"
                onClick={() => setSize(s)}
              >
                {s === 'full' ? 'Full' : 'Half'} {rupees((s === 'full' ? offer ?? item.full : item.half) ?? 0)}
              </MButton>
            ))}
          </div>
        )}
        <div className="dish-foot">
          <span className={orderable ? 'price' : 'price-tbd'}>
            {orderable && size === 'full' && offer != null && item.full != null && <s className="was">{rupees(item.full)}</s>}
            {orderable ? rupees(price) : 'Price at the counter'}
          </span>
          {!orderable ? null : qty === 0 ? (
            <MButton className="add" onClick={() => cart.dispatch({ type: 'add', itemId: item.id, size })}>
              Add
            </MButton>
          ) : (
            <div className="stepper" aria-label={`${item.name}, ${qty} in your order`}>
              <MButton onClick={() => cart.dispatch({ type: 'dec', itemId: item.id, size })} aria-label="Remove one">−</MButton>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={qty} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }} transition={spring}>{qty}</motion.span>
              </AnimatePresence>
              <MButton onClick={() => cart.dispatch({ type: 'add', itemId: item.id, size })} aria-label="Add one">+</MButton>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  )
}
