import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { media } from './menu'

const photos = [
  { src: 'night-huts-2.jpg', title: 'Two huts, one blue glow', note: 'Bamboo cabins wired in LED, right off the bypass' },
  { src: 'banner.jpg', title: 'Tasty · Fresh · Hygienic', note: 'The four promises on every board' },
  { src: 'counter.jpg', title: 'The counter', note: 'Momos up front, cold drinks in the chiller' },
  { src: 'shed-bike.jpg', title: 'Park right at the table', note: 'Pull in, kill the engine, order' },
  { src: 'wok.jpg', title: 'Fired up to order', note: 'Every plate tossed on a roaring wok' },
  { src: 'parking.jpg', title: 'Room for cars and bikes', note: 'Big lot, bright lights' },
  { src: 'shed-trees.jpg', title: 'Open-air seating', note: 'Plastic chairs, night breeze, hot plates' },
  { src: 'menu-board.jpg', title: 'The full board', note: 'Every dish, full and half plates' },
  { src: 'hut.jpg', title: 'Find the glowing roof', note: 'You can see it from the road' },
]

// 3×3 photo collage. Tap a photo to see it large.
export default function Gallery() {
  const grid = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      const tiles = gsap.utils.toArray<HTMLElement>('.collage-tile')
      // Each tile wipes open from a different side, the photo settles from a zoom, then a neon shine sweeps across.
      const from = ['inset(0 100% 0 0)', 'inset(100% 0 0 0)', 'inset(0 0 0 100%)', 'inset(0 0 100% 0)']
      const tl = gsap.timeline({
        scrollTrigger: { trigger: grid.current, start: 'top 78%' },
        onComplete: () => grid.current?.classList.add('lit'),
      })
      tiles.forEach((t, i) => {
        const at = [4, 1, 3, 5, 7, 0, 2, 6, 8].indexOf(i) * 0.09
        tl.fromTo(t, { clipPath: from[i % 4], rotate: i % 2 ? 2.5 : -2.5 }, { clipPath: 'inset(0 0 0 0)', rotate: 0, duration: 0.9, ease: 'expo.out' }, at)
        tl.fromTo(t.querySelector('.tile-inner'), { scale: 1.35 }, { scale: 1, duration: 1.2, ease: 'power3.out', clearProps: 'transform' }, at)
        tl.fromTo(t.querySelector('img'), { filter: 'brightness(2) saturate(0)' }, { filter: 'brightness(1) saturate(1)', duration: 1.2, ease: 'power3.out', clearProps: 'filter' }, at)
      })
      // Collage depth: the middle column drifts against the scroll on wider screens.
      gsap.matchMedia().add('(min-width: 700px)', () => {
        gsap.fromTo(tiles.filter((_, i) => i % 3 === 1), { y: 50 }, {
          y: -50, ease: 'none',
          scrollTrigger: { trigger: grid.current, start: 'top bottom', end: 'bottom top', scrub: true },
        })
      })
    }, grid)
    return () => ctx.revert()
  }, [])

  // Pointer tilt and glare on devices with a mouse.
  function tilt(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    e.currentTarget.style.setProperty('--ry', `${(x - 0.5) * 10}deg`)
    e.currentTarget.style.setProperty('--rx', `${(0.5 - y) * 10}deg`)
    e.currentTarget.style.setProperty('--gx', `${x * 100}%`)
    e.currentTarget.style.setProperty('--gy', `${y * 100}%`)
  }
  function untilt(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.style.setProperty('--rx', '0deg')
    e.currentTarget.style.setProperty('--ry', '0deg')
  }

  useEffect(() => {
    if (open == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => ((i ?? 0) + 1) % photos.length)
      if (e.key === 'ArrowLeft') setOpen((i) => ((i ?? 0) + photos.length - 1) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const cur = open == null ? null : photos[open]

  return (
    <section className="collage" aria-labelledby="collage-title">
      <div className="collage-head">
        <p className="eyebrow">After dark on the bypass</p>
        <h2 id="collage-title">Under the blue lights</h2>
      </div>
      <div className="collage-grid" ref={grid}>
        {photos.map((p, i) => (
          <button
            key={p.src}
            className="collage-tile"
            onClick={() => setOpen(i)}
            onPointerMove={tilt}
            onPointerLeave={untilt}
            aria-label={`View photo: ${p.title}`}
            style={{ '--kb-delay': `${-i * 1.7}s`, '--shine-delay': `${(i % 3) * 0.12 + Math.floor(i / 3) * 0.12}s` } as React.CSSProperties}
          >
            <span className="tile-inner">
              <img src={media(p.src)} alt="" loading="lazy" />
              <span className="tile-shine" />
              <span className="tile-glare" />
              <span className="collage-cap">
                <strong>{p.title}</strong>
                <small>{p.note}</small>
              </span>
            </span>
          </button>
        ))}
      </div>

      {cur && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={cur.title} onClick={() => setOpen(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={media(cur.src)} alt={cur.title} />
            <figcaption><strong>{cur.title}</strong> · {cur.note}</figcaption>
          </figure>
          <button className="icon-btn lb-close" onClick={() => setOpen(null)} aria-label="Close">✕</button>
          <button className="icon-btn lb-prev" onClick={(e) => { e.stopPropagation(); setOpen((open! + photos.length - 1) % photos.length) }} aria-label="Previous photo">‹</button>
          <button className="icon-btn lb-next" onClick={(e) => { e.stopPropagation(); setOpen((open! + 1) % photos.length) }} aria-label="Next photo">›</button>
        </div>
      )}
    </section>
  )
}
