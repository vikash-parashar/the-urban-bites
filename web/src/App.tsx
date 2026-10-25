import { ThemePicker } from './ThemePicker'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { business, media } from './menu'
import { registerOffers, useCart } from './cart'
import { useMyOrders } from './orders'
import { useShop } from './shop'
import Embers from './Embers'
import Menu from './Menu'
import CartDrawer from './CartDrawer'
import Gallery from './Gallery'
import HeroSound from './HeroSound'
import { DeliveryBanner, Offers, Promise as OurPromise, Regulars, ShopNotice, Social } from './Extras'
import Intro from './Intro'

gsap.registerPlugin(ScrollTrigger)

const marqueeItems = [
  ['Momos', 'मोमोज'],
  ['Afghani Chaap', 'अफगानी चाप'],
  ['Paneer Tikka', 'पनीर टिक्का'],
  ['Lachha Paratha', 'लच्छा परांठा'],
  ['Honey Chilli', 'हनी चिली'],
  ['Shakkar Wali Chai', 'शक्कर वाली चाय'],
  ['Cold Coffee', 'कोल्ड कॉफी'],
  ['Paneer Chilli', 'पनीर चिल्ली'],
]


export default function App() {
  const cart = useCart()
  const { shop, offers } = useShop()
  // Offer prices feed the cart before anything renders a price.
  const offersVersion = useMemo(() => {
    registerOffers(offers)
    return offers.length + offers.reduce((n, o) => n + (o.offer_price ?? 0), 0)
  }, [offers])
  const [cartOpen, setCartOpen] = useState(false)
  const [view, setView] = useState<'cart' | 'track'>('cart')
  const myOrders = useMyOrders()
  const openCart = () => {
    setView('cart')
    setCartOpen(true)
  }
  const openTracker = () => {
    setView('track')
    setCartOpen(true)
  }
  const root = useRef<HTMLDivElement>(null)
  const heroVideo = useRef<HTMLVideoElement>(null)

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Opening: the LED roofline draws itself, sputters on, then the name lands.
        const roof = root.current!.querySelectorAll<SVGPathElement>('.roof path')
        roof.forEach((p) => {
          const len = p.getTotalLength()
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len })
        })
        // Wait for the opening card (Intro) on the first visit of the session.
        let introShowing = false
        try {
          introShowing = !sessionStorage.getItem('ub-intro')
        } catch {
          /* storage blocked */
        }
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: introShowing ? 2.2 : 0 })
        tl.to(roof, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut', stagger: 0.15 })
          .fromTo('.roof', { opacity: 0.3 }, { opacity: 1, duration: 0.5, ease: 'steps(6)' }, '-=0.3')
          .from('.hero-the', { y: 20, opacity: 0, duration: 0.5 }, '-=0.6')
          .from('.hero-urban span', { yPercent: 110, duration: 0.9, stagger: 0.06, ease: 'expo.out' }, '-=0.4')
          .from('.hero-bites', { scale: 0.6, rotate: -14, opacity: 0, duration: 0.9, ease: 'back.out(2)' }, '-=0.5')
          .from('.hero-promise li', { y: 14, opacity: 0, duration: 0.5, stagger: 0.08 }, '-=0.4')
          .from('.hero-cta > *', { y: 18, opacity: 0, duration: 0.5, stagger: 0.1 }, '-=0.3')

        // Neon strips never hold perfectly steady.
        gsap.to('.roof', {
          opacity: 0.82,
          duration: 0.08,
          repeat: -1,
          yoyo: true,
          repeatDelay: 3.2,
          ease: 'none',
        })

        gsap.to('.hero-video', {
          yPercent: 18,
          scale: 1.12,
          ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
        })
        gsap.to('.hero-copy', {
          yPercent: -30,
          opacity: 0.2,
          ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
        })

        gsap.fromTo(
          '.reel-frame',
          { scale: 0.72, borderRadius: 40 },
          {
            scale: 1,
            borderRadius: 12,
            ease: 'none',
            scrollTrigger: { trigger: '.reel', start: 'top 85%', end: 'center center', scrub: true },
          },
        )
        gsap.from('.reel-line', {
          yPercent: 100,
          stagger: 0.12,
          duration: 0.8,
          ease: 'expo.out',
          scrollTrigger: { trigger: '.reel', start: 'top 70%' },
        })
      })

    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={root}>
      <Intro />
      <ThemePicker />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="The Urban Bites, back to top">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}brand/mark-256.png`} alt="" width={36} height={36} />
          <span className="brand-urban">Urban</span>
          <span className="brand-bites">Bites</span>
        </a>
        <nav className="topnav" aria-label="Sections">
          <a href="#menu"><span aria-hidden="true">🍽️</span>Menu</a>
          {offers.length > 0 && <a href="#offers"><span aria-hidden="true">🔥</span>Offers</a>}
          <a href="#regulars"><span aria-hidden="true">👑</span>Regulars</a>
          <a href="#visit"><span aria-hidden="true">📍</span>Visit</a>
        </nav>
        <button className="cart-pill" onClick={openCart} aria-label={`Open your order, ${cart.count} items`}>
          <span aria-hidden="true">🛒</span><span className="cart-label">Order</span><span className="cart-count">{cart.count}</span>
        </button>
      </header>
      <ShopNotice shop={shop} />

      <section className="hero" id="top">
        <video ref={heroVideo} className="hero-video" src={media('flame.mp4')} poster={media('flame-poster.jpg')} autoPlay muted loop playsInline />
        <div className="hero-shade" />
        <Embers />
        <div className="hero-copy">
          <svg className="roof" viewBox="0 0 600 120" aria-hidden="true">
            <path d="M10 110 L150 18 L290 110" />
            <path d="M290 110 L430 30 L590 110" />
          </svg>
          <p className="hero-the">The</p>
          <h1 className="hero-title">
            <span className="hero-urban" aria-label="Urban">
              {'URBAN'.split('').map((ch, i) => (
                <span key={i} aria-hidden="true">{ch}</span>
              ))}
            </span>
            <span className="hero-bites">Bites</span>
          </h1>
          <p className="hero-deal">
            <span>Free delivery</span> within {shop.free_delivery_km} km over ₹{shop.free_delivery_min}
          </p>
          <ul className="hero-promise">
            <li>Tasty</li>
            <li>Fresh</li>
            <li>Hygienic</li>
            <li>Quality</li>
          </ul>
          <p className="hero-motto" lang="hi">स्वाद, सफ़ाई और गुणवत्ता में कोई मुकाबला नहीं</p>
          <div className="hero-cta">
            <a className="btn btn-gold" href="#menu">See the menu</a>
            <a className="btn btn-ghost" href={`tel:${business.phone}`}>Call 83989 07216</a>
          </div>
        </div>
        <p className="hero-where">Julana Bypass · near Brahmanwas</p>
        <HeroSound video={heroVideo} />
      </section>

      <div className="marquees" aria-hidden="true">
        <div className="marquee marquee-gold">
          <div className="marquee-run">
            {[...marqueeItems, ...marqueeItems].map(([en], i) => (
              <span key={i}>{en}<i>✦</i></span>
            ))}
          </div>
        </div>
        <div className="marquee marquee-neon">
          <div className="marquee-run reverse">
            {[...marqueeItems, ...marqueeItems].map(([, hi], i) => (
              <span key={i} lang="hi">{hi}<i>•</i></span>
            ))}
          </div>
        </div>
      </div>

      <DeliveryBanner shop={shop} />

      <OurPromise />


      <Offers offers={offers} cart={cart} onOpenCart={openCart} />

      <Menu cart={cart} offersVersion={offersVersion} />

      <Regulars localOrders={myOrders.orders.length} />

      <section className="reel" aria-labelledby="reel-title">
        <div className="reel-copy">
          <h2 id="reel-title">
            <span className="reel-mask"><span className="reel-line">Park the bike.</span></span>
            <span className="reel-mask"><span className="reel-line gold">Pull up a chair.</span></span>
          </h2>
          <p>Space for cars, bikes and trucks right outside. Eat at the tables, or pack it for the road.</p>
        </div>
        <div className="reel-frame">
          <video src={media('walkthrough.mp4')} poster={media('walkthrough-poster.jpg')} autoPlay muted loop playsInline />
        </div>
      </section>

      <section className="visit" id="visit" aria-labelledby="visit-title">
        <div className="visit-media">
          <div className="visit-photo">
            <img src={media('hut.jpg')} alt="The Urban Bites hut lit with blue LED strips at night" loading="lazy" />
          </div>
          <div className="visit-map">
            <iframe
              title="Map: The Urban Bites, Julana Bypass"
              src={`https://maps.google.com/maps?q=${business.lat},${business.lng}&z=16&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
        <div className="visit-copy">
          <p className="eyebrow">Find us</p>
          <h2 id="visit-title">Julana Bypass, near Brahmanwas</h2>
          <p>Look for the bamboo huts outlined in blue light. Order ahead and your food is hot when you pull in.</p>
          <dl className="visit-facts">
            <div>
              <dt>Order line</dt>
              <dd><a href={`tel:${business.phone}`}>83989 07216</a></dd>
            </div>
            <div>
              <dt>Specialty</dt>
              <dd>Shakkar wali chai</dd>
            </div>
          </dl>
          <a
            className="btn btn-gold"
            href={`https://www.google.com/maps/dir/?api=1&destination=${business.lat},${business.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Get directions
          </a>
          <a className="visit-pin" href={`https://www.google.com/maps/search/?api=1&query=${business.lat},${business.lng}`} target="_blank" rel="noreferrer">
            Open the pin in Google Maps · {business.lat}, {business.lng}
          </a>
        </div>
      </section>

      <Gallery />

      <Social lat={business.lat} lng={business.lng} />

      <footer className="footer">
        <span className="brand">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}brand/mark-256.png`} alt="" width={44} height={44} />
          <span className="brand-urban">The Urban</span>
          <span className="brand-bites">Bites</span>
        </span>
        <span>Momos · Chaap · Paneer · Paratha · Chai</span>
        <span>© {new Date().getFullYear()} The Urban Bites · <a href="#staff">Staff sign in</a></span>
      </footer>

      {cart.count === 0 && !cartOpen && myOrders.latest && (
        <button className="cart-bar track-bar" onClick={openTracker}>
          <span className="live-dot" aria-hidden="true" />
          <span>Order #{myOrders.latest.number}</span>
          <span className="cart-bar-go">Track it →</span>
        </button>
      )}
      {cart.count > 0 && !cartOpen && (
        <button className="cart-bar" onClick={openCart}>
          <span>{cart.count} {cart.count === 1 ? 'item' : 'items'}</span>
          <strong>₹{cart.total.toLocaleString('en-IN')}</strong>
          <span className="cart-bar-go">View order →</span>
        </button>
      )}
      <CartDrawer
        cart={cart}
        shop={shop}
        pastOrders={myOrders.orders}
        open={cartOpen}
        tracking={view === 'track' ? myOrders.latest : undefined}
        onPlaced={(o) => {
          myOrders.add(o)
          setView('track')
        }}
        onClose={() => setCartOpen(false)}
      />
    </div>
  )
}
