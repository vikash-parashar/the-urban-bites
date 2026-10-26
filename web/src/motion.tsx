// Shared Framer Motion pieces for the whole site: scroll reveals, staggered lists and lively buttons.
// MotionConfig reducedMotion="user" (in main.tsx) turns movement off for people who ask for less motion.
import { motion, type HTMLMotionProps, type Transition, type Variants } from 'motion/react'
import type { ReactNode } from 'react'

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 26, mass: 0.7 }
export const ease = [0.22, 1, 0.36, 1] as const

/** Hover lifts, a press squashes: spread onto any motion.button / motion.a. */
export const alive = {
  whileHover: { y: -2, scale: 1.04 },
  whileTap: { scale: 0.94, y: 0 },
  transition: spring,
} as const

/** Cards: a softer lift on hover. */
export const lift = {
  whileHover: { y: -6, transition: spring },
  whileTap: { scale: 0.985 },
} as const

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
}

export const slideIn: Variants = {
  hidden: { opacity: 0, y: 40, rotate: -1.2 },
  show: { opacity: 1, y: 0, rotate: 0, transition: { duration: 0.6, ease } },
}

export const stagger = (gap = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
})

const view = { once: true, amount: 0.2 } as const

type DivProps = HTMLMotionProps<'div'> & { children?: ReactNode }

/** Fades and slides its content up when scrolled into view. */
export function Reveal({ children, delay = 0, ...rest }: DivProps & { delay?: number }) {
  return (
    <motion.div initial="hidden" whileInView="show" viewport={view} variants={fadeUp} transition={{ delay }} {...rest}>
      {children}
    </motion.div>
  )
}

/** A container whose StaggerItem children reveal one after another on scroll. */
export function Stagger({ children, gap = 0.07, delay = 0, ...rest }: DivProps & { gap?: number; delay?: number }) {
  return (
    <motion.div initial="hidden" whileInView="show" viewport={view} variants={stagger(gap, delay)} {...rest}>
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, ...rest }: DivProps) {
  return <motion.div variants={slideIn} {...rest}>{children}</motion.div>
}

export const MButton = (p: HTMLMotionProps<'button'>) => <motion.button {...alive} {...p} />
export const MA = (p: HTMLMotionProps<'a'>) => <motion.a {...alive} {...p} />
