import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { categories as bundled, dishImage, rupees, type Category, type MenuItem, type Size } from './menu'
import { offerPrice, registerMenu, type Cart } from './cart'
import { fetchMenu } from './api'
import { categoryEmoji, itemKind } from './kit'

// offersVersion changes when today's offers load, so offer prices re-render.
export default function Menu({ cart, offersVersion }: { cart: Cart; offersVersion: number }) {
  const [categories, setCategories] = useState<Category[]>(bundled)
  const [active, setActive] = useState(bundled[0].id)
  const [query, setQuery] = useState('')
  const grid = useRef<HTMLDivElement>(null)
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

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cards = grid.current!.querySelectorAll('.dish')
    const tween = gsap.fromTo(
      cards,
      { y: 24, rotate: -1.5 },
      { y: 0, rotate: 0, duration: 0.6, stagger: 0.05, ease: 'power3.out' },
    )
    return () => {
      tween.kill()
    }
  }, [active, q === ''])

  return (
    <section className="menu" id="menu" aria-labelledby="menu-title">
      <div className="menu-head">
        <p className="eyebrow">The board, now online</p>
        <h2 id="menu-title">Menu</h2>
        <p className="menu-sub">Full and half plates, same prices as the board at the cart.</p>
      </div>

      <div className="menu-search">
        <label htmlFor="menu-q" className="sr-only">Search the menu</label>
        <input id="menu-q" type="search" placeholder="Search: chaap, momos, chai…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="tabs" role="tablist" aria-label="Menu sections" hidden={!!q}>
        {categories.map((c) => (
          <button
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
          </button>
        ))}
      </div>

      <div className="dishes" id="menu-panel" role={q ? 'region' : 'tabpanel'} aria-labelledby={q ? undefined : `tab-${active}`} aria-label={q ? 'Search results' : undefined} ref={grid} data-offers={offersVersion}>
        {shown.map((item) => (
          <Dish key={item.id} item={item} cart={cart} category={categories.find((c) => c.items.includes(item))?.name ?? ''} />
        ))}
        {q && shown.length === 0 && (
          <p className="menu-sub">Nothing called "{query.trim()}" on the board. Try another word, or call us and ask.</p>
        )}
      </div>
    </section>
  )
}

function Dish({ item, cart, category }: { item: MenuItem; cart: Cart; category: string }) {
  const kind = itemKind(item.name, category)
  const [size, setSize] = useState<Size>('full')
  const offer = offerPrice(item)
  const price = size === 'half' ? item.half : offer ?? item.full
  const qty = cart.qtyOf(item.id, size)
  const orderable = price != null

  return (
    <article className={`dish ${offer != null ? 'has-offer' : ''}`}>
      {offer != null && <span className="offer-tag">Offer</span>}
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
        {item.half != null && (
          <div className="sizes" role="radiogroup" aria-label={`${item.name} plate size`}>
            {(['full', 'half'] as const).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={size === s}
                className="size"
                onClick={() => setSize(s)}
              >
                {s === 'full' ? 'Full' : 'Half'} {rupees((s === 'full' ? offer ?? item.full : item.half) ?? 0)}
              </button>
            ))}
          </div>
        )}
        <div className="dish-foot">
          <span className={orderable ? 'price' : 'price-tbd'}>
            {orderable && size === 'full' && offer != null && item.full != null && <s className="was">{rupees(item.full)}</s>}
            {orderable ? rupees(price) : 'Price at the counter'}
          </span>
          {!orderable ? null : qty === 0 ? (
            <button className="add" onClick={() => cart.dispatch({ type: 'add', itemId: item.id, size })}>
              Add
            </button>
          ) : (
            <div className="stepper" aria-label={`${item.name}, ${qty} in your order`}>
              <button onClick={() => cart.dispatch({ type: 'dec', itemId: item.id, size })} aria-label="Remove one">−</button>
              <span>{qty}</span>
              <button onClick={() => cart.dispatch({ type: 'add', itemId: item.id, size })} aria-label="Add one">+</button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
