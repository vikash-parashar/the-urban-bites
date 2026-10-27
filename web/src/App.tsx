import { LookSwitch, useTheme } from './ThemePicker'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useScroll, useTransform, type Variants } from 'motion/react'
import { alive, ease, MA, MButton, Reveal, spring, stagger } from './motion'
import { business, media } from './menu'
import { registerOffers, useCart } from './cart'
import { useMyOrders, useStillOpen } from './orders'
import { useShop } from './shop'
import Embers from './Embers'
import Menu from './Menu'
import CartDrawer from './CartDrawer'
import Gallery from './Gallery'
import { greetOnce, sayFun } from './voice'
import HeroSound from './HeroSound'
import FavouritesPopup from './Favourites'
import { DeliveryBanner, Offers, Promise as OurPromise, Regulars, ShopNotice, Social } from './Extras'
import Intro from './Intro'
import MyOrders from './MyOrders'
import type { PlacedOrder } from './api'
import PopHero from './PopHero'
import { brand } from './brand'
import Wordmark from './Wordmark'
import { developer, social } from './social'

// The opening waits for the intro card on the first visit of the session.
function introDelay() {
  try {
    return sessionStorage.getItem('ub-intro') ? 0 : 2.2
  } catch {
    return 0
  }
}

const letter: Variants = { hidden: { y: '110%' }, show: { y: 0, transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] } } }
const rise: Variants = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }

const marqueeItems = [
  ['Momos', 'मोमोज'],
  ['Afghani Chaap', 'अफ़गानी चाप'],
  ['Paneer Tikka', 'पनीर टिक्का'],
  ['Lachha Paratha', 'लच्छा परांठा'],
  ['Honey Chilli Fries', 'हनी चिली फिंगर चिप्स'],
  ['Shakkar Wali Chai', 'शक्कर वाली चाय'],
  ['Cold Coffee', 'कोल्ड कॉफ़ी'],
  ['Chilli Paneer', 'चिली पनीर'],
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
  const [trackId, setTrackId] = useState<string>()
  const openTracker = (o?: PlacedOrder) => {
    setTrackId(o?.id)
    setView('track')
    setCartOpen(true)
  }
  const latestOpen = useStillOpen(myOrders.latest)
  const tracked = myOrders.orders.find((o) => o.id === trackId) ?? myOrders.latest
  const heroVideo = useRef<HTMLVideoElement>(null)
  // Some phones ignore autoPlay unless muted is set on the element itself; nudge it once.
  // Haryanvi "Ram Ram ji" welcome, once a day, at the visitor's first tap.
  // Closed for the night or paused: a different (still friendly) line.
  const shopRef = useRef(shop); shopRef.current = shop
  useEffect(() => greetOnce('welcome', () => {
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const mins = t.getHours() * 60 + t.getMinutes()
    if (mins < 11 * 60 + 30 || mins >= 23 * 60) return 'closed'
    return shopRef.current.accepting_orders ? 'welcome' : 'paused'
  }), [])
  // Little Haryanvi reactions to the cart: a compliment on adding, a cheer for free delivery.
  const prevCart = useRef({ count: cart.count, total: cart.total })
  useEffect(() => {
    const p = prevCart.current
    prevCart.current = { count: cart.count, total: cart.total }
    if (cart.count > p.count) {
      if (p.total < shop.free_delivery_min && cart.total >= shop.free_delivery_min) sayFun('free', ['free_delivery'], 10 * 60_000)
      else if (cart.count - p.count === 1) sayFun('add', ['add_1', 'add_2', 'add_3', 'add_4'], 2 * 60_000)
    } else if (cart.count === 0 && p.count > 0) sayFun('empty', ['cart_empty'], 5 * 60_000)
  }, [cart.count, cart.total, shop.free_delivery_min])
  useEffect(() => { const v = heroVideo.current; if (v) { v.muted = true; v.play().catch(() => {}) } }, [])
  const look = useTheme()

  const hero = useRef<HTMLElement>(null)
  const reel = useRef<HTMLElement>(null)
  const start = useMemo(introDelay, [])
  // Parallax: the flame video sinks and zooms, the title floats up and fades as you scroll past.
  const { scrollYProgress: heroP } = useScroll({ target: hero, offset: ['start start', 'end start'] })
  const videoY = useTransform(heroP, [0, 1], ['0%', '18%'])
  const videoScale = useTransform(heroP, [0, 1], [1, 1.12])
  const copyY = useTransform(heroP, [0, 1], ['0%', '-30%'])
  const copyFade = useTransform(heroP, [0, 1], [1, 0.2])
  // The walk-in video grows from a rounded card to full size as it scrolls in.
  const { scrollYProgress: reelP } = useScroll({ target: reel, offset: ['start 85%', 'center center'] })
  const reelScale = useTransform(reelP, [0, 1], [0.72, 1])
  const reelRadius = useTransform(reelP, [0, 1], [40, 12])

  return (
    <div>
      <Intro />
      <header className="topbar">
        <a className="brand" href="#top" aria-label={`${brand.name}, back to top`}>
          <img className="brand-mark" src={brand.logoUrl} alt="" width={72} height={33} />
          <Wordmark />
        </a>
        <nav className="topnav" aria-label="Sections">
          <a href="#menu"><span aria-hidden="true">🍽️</span>Menu</a>
          {myOrders.orders.length > 0 && <a href="#my-orders"><span aria-hidden="true">🧾</span>My orders</a>}
          {offers.length > 0 && <a href="#offers"><span aria-hidden="true">🔥</span>Offers</a>}
          <a href="#regulars"><span aria-hidden="true">👑</span>Regulars</a>
          <a href="#visit"><span aria-hidden="true">📍</span>Visit</a>
          <a href="#staff" className="topnav-staff"><span aria-hidden="true">👤</span>Staff login</a>
        </nav>
        <div className="top-actions">
          <a className="staff-pill" href="#staff" aria-label="Staff login: owner and delivery partners">
            <span aria-hidden="true">👤</span><span className="staff-pill-text">Staff login</span>
          </a>
          <LookSwitch />
          <MButton className="cart-pill" onClick={openCart} aria-label={`Open your order, ${cart.count} items`}>
            <span aria-hidden="true">🛒</span><span className="cart-label">Order</span>
            {/* The count pops each time something is added. */}
            <motion.span key={cart.count} className="cart-count" initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>{cart.count}</motion.span>
          </MButton>
        </div>
      </header>
      <ShopNotice shop={shop} />

      <section className="hero" id="top" ref={hero}>
        <motion.video ref={heroVideo} className="hero-video" style={{ y: videoY, scale: videoScale }} src={media('hero-mix.mp4')} poster={media('hero-mix-poster.jpg')} autoPlay muted loop playsInline />
        <div className="hero-shade" />
        {look !== 'pop' && <Embers />}
        {look === 'pop' && <PopHero box={hero} freeMin={shop.free_delivery_min} delay={start} />}
        <motion.div className="hero-copy" style={{ y: copyY, opacity: copyFade }}>
          {/* The LED roofline draws itself, sputters on and keeps flickering like a real neon strip. */}
          <motion.svg className="roof" viewBox="0 0 600 120" aria-hidden="true"
            initial={{ opacity: 0.3 }} animate={{ opacity: [0.3, 1, 0.5, 1, 0.82, 1] }}
            transition={{ delay: start + 1.1, duration: 0.6, times: [0, 0.2, 0.35, 0.5, 0.7, 1] }}>
            {['M10 110 L150 18 L290 110', 'M290 110 L430 30 L590 110'].map((d, i) => (
              <motion.path key={d} d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ delay: start + i * 0.15, duration: 1.4, ease: [0.65, 0, 0.35, 1] }} />
            ))}
          </motion.svg>
          <motion.p className="hero-the" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: start + 1, duration: 0.5 }}>{brand.lead}</motion.p>
          <h1 className="hero-title">
            <motion.span className="hero-urban" aria-label={brand.main} initial="hidden" animate="show" variants={stagger(0.06, start + 1.2)}>
              {brand.main.toUpperCase().split('').map((ch, i) => (
                <motion.span key={i} aria-hidden="true" variants={letter}>{ch}</motion.span>
              ))}
            </motion.span>
            <motion.span className="hero-bites" initial={{ scale: 0.6, rotate: -20, y: '-0.12em', opacity: 0 }} animate={{ scale: 1, rotate: -6, y: '-0.12em', opacity: 1 }}
              transition={{ delay: start + 1.6, type: 'spring', stiffness: 260, damping: 12 }} whileHover={{ rotate: -12, scale: 1.08 }}>{brand.accent}</motion.span>
          </h1>
          <p className="hero-deal">
            <span>Free delivery</span> within {shop.free_delivery_km} km over ₹{shop.free_delivery_min}
          </p>
          <motion.ul className="hero-promise" initial="hidden" animate="show" variants={stagger(0.08, start + 2)}>
            {['Tasty', 'Fresh', 'Hygienic', 'Quality'].map((w) => <motion.li key={w} variants={rise} whileHover={{ y: -3, scale: 1.08 }}>{w}</motion.li>)}
          </motion.ul>
          <p className="hero-motto" lang="hi">{brand.motto}</p>
          <motion.div className="hero-cta" initial="hidden" animate="show" variants={stagger(0.1, start + 2.3)}>
            <motion.a className="btn btn-gold" href="#menu" variants={rise} {...alive}>See the menu</motion.a>
            <motion.a className="btn btn-ghost" href={`tel:${business.phone}`} variants={rise} {...alive}>Call {brand.phone_display}</motion.a>
          </motion.div>
        </motion.div>
        <p className="hero-where">Julana Bypass · near Brahmanwas</p>
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


      <MyOrders orders={myOrders.orders} onOpen={openTracker} />

      <Offers offers={offers} cart={cart} onOpenCart={openCart} />

      <Menu cart={cart} offersVersion={offersVersion} />

      <Regulars localOrders={myOrders.orders.length} />

      <section className="reel" aria-labelledby="reel-title" ref={reel}>
        <motion.div className="reel-copy" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }} variants={stagger(0.12)}>
          <h2 id="reel-title">
            <span className="reel-mask"><motion.span className="reel-line" variants={letter}>Park the bike.</motion.span></span>
            <span className="reel-mask"><motion.span className="reel-line gold" variants={letter}>Pull up a chair.</motion.span></span>
          </h2>
          <motion.p variants={rise}>Space for cars, bikes and trucks right outside. Eat at the tables, or pack it for the road.</motion.p>
        </motion.div>
        <motion.div className="reel-frame" style={{ scale: reelScale, borderRadius: reelRadius }}>
          <video src={media('walkthrough.mp4')} poster={media('walkthrough-poster.jpg')} autoPlay muted loop playsInline />
        </motion.div>
      </section>

      <section className="visit" id="visit" aria-labelledby="visit-title">
        <motion.div className="visit-media" initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.7, ease }}>
          <div className="visit-photo">
            <img src={media('hut.jpg')} alt={`${brand.name} hut lit with blue LED strips at night`} loading="lazy" />
          </div>
          <div className="visit-map">
            <iframe
              title={`Map: ${brand.name}, ${brand.place}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(`${brand.name}, ${brand.place}, ${brand.region}`)}&ll=${business.lat},${business.lng}&z=16&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </motion.div>
        <Reveal className="visit-copy">
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
          <MA
            className="btn btn-gold"
            href={business.maps_url}
            target="_blank"
            rel="noreferrer"
          >
            Get directions
          </MA>
          <a className="visit-pin" href={`https://www.google.com/maps/search/?api=1&query=${business.lat},${business.lng}`} target="_blank" rel="noreferrer">
            Open the pin in Google Maps · {business.lat}, {business.lng}
          </a>
        </Reveal>
      </section>

      <Gallery />

      <Social lat={business.lat} lng={business.lng} />

      <HeroSound />
      <FavouritesPopup orders={myOrders.orders} cart={cart} accepting={shop.accepting_orders} onOpenCart={openCart} />
      <footer className="footer">
        <span className="brand">
          <img className="brand-mark" src={brand.logoUrl} alt="" width={96} height={43} />
          <Wordmark />
        </span>
        <div className="dev-credit">
          <span>Website & app designed and developed by <strong>{developer.name}</strong>, founder of <strong>{developer.company}</strong></span>
          <MA className="btn btn-ghost btn-sm" href={developer.contact} target="_blank" rel="noopener">💻 Want a website like this? Contact the developer</MA>
        </div>
      </footer>

      {cart.count === 0 && !cartOpen && myOrders.latest && latestOpen && (
        <motion.button className="cart-bar track-bar" onClick={() => openTracker()} style={{ x: '-50%' }} initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.97 }} transition={spring}>
          <span className="live-dot" aria-hidden="true" />
          <span>Order #{myOrders.latest.number}</span>
          <span className="cart-bar-go">Track it →</span>
        </motion.button>
      )}
      {cart.count > 0 && !cartOpen && (
        <motion.button className="cart-bar" onClick={openCart} style={{ x: '-50%' }} initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.97 }} transition={spring}>
          <span>{cart.count} {cart.count === 1 ? 'item' : 'items'}</span>
          <strong>₹{cart.total.toLocaleString('en-IN')}</strong>
          <span className="cart-bar-go">View order →</span>
        </motion.button>
      )}
      <CartDrawer
        cart={cart}
        shop={shop}
        pastOrders={myOrders.orders}
        open={cartOpen}
        tracking={view === 'track' ? tracked : undefined}
        onPlaced={(o) => {
          myOrders.add(o)
          setTrackId(o.id)
          setView('track')
        }}
        onShowCart={() => setView('cart')}
        onClose={() => setCartOpen(false)}
      />
    </div>
  )
}
