import { useEffect, useRef } from 'react'

// Sparks drifting up off the wok in the hero video.
export default function Embers() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const spawn = () => ({
      x: Math.random() * w,
      y: h + Math.random() * 40,
      r: 0.6 + Math.random() * 2,
      vy: 0.4 + Math.random() * 1.3,
      sway: Math.random() * Math.PI * 2,
      life: 0,
      max: 160 + Math.random() * 220,
    })
    const count = Math.round(Math.min(70, w / 14))
    const sparks = Array.from({ length: count }, () => {
      const s = spawn()
      s.y = Math.random() * h
      s.life = Math.random() * s.max
      return s
    })

    let raf = 0
    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      for (const s of sparks) {
        s.life++
        s.y -= s.vy
        s.sway += 0.03
        s.x += Math.sin(s.sway) * 0.4
        const t = s.life / s.max
        if (t >= 1 || s.y < -10) Object.assign(s, spawn())
        const a = Math.sin(Math.PI * Math.min(t, 1)) * 0.9
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4)
        g.addColorStop(0, `rgba(255, 214, 120, ${a})`)
        g.addColorStop(0.4, `rgba(255, 120, 30, ${a * 0.5})`)
        g.addColorStop(1, 'rgba(255, 80, 0, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="embers" aria-hidden="true" />
}
