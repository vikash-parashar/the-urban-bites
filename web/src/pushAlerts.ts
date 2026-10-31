// Order alerts while the staff screen is closed (Web Push). The browser keeps a push subscription
// even with every tab closed; the API sends new orders and customer cancels to it, and public/sw.js
// shows them as notifications. Works in Chrome/Edge/Firefox on Android and desktop, and on iPhone
// (iOS 16.4+) once "UB Orders" is added to the Home Screen. Inside the Android app none of this
// is needed: the app rings through Firebase (see push.ts).
import { useCallback, useEffect, useState } from 'react'
import { inApp, isIOS, isStandalone } from './install'
import { staffApi } from './staffApi'

export type PushState = 'loading' | 'unsupported' | 'in-app' | 'ios-install' | 'server-off' | 'denied' | 'off' | 'on'

let keyCache: Promise<string> | null = null
const serverKey = () => (keyCache ??= staffApi.webPushKey().then((r) => r.public_key).catch(() => { keyCache = null; return '' }))

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function registration() {
  // install.ts registers sw.js on https; register here too so localhost testing works.
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('./sw.js')
}

function toBytes(b64url: string) {
  const s = atob((b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function current(): Promise<PushSubscription | null> {
  const reg = await registration()
  await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

async function send(sub: PushSubscription, test: boolean) {
  const j = sub.toJSON()
  await staffApi.webPushSubscribe({ endpoint: j.endpoint!, keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth }, test })
}

export async function pushState(): Promise<PushState> {
  if (inApp()) return 'in-app'
  if (!supported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  if (!(await serverKey())) return 'server-off'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await current().catch(() => null)
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Ask for permission (must run from a tap) and subscribe this browser for order alerts. */
export async function enablePush(): Promise<PushState> {
  const key = await serverKey()
  if (!key) return 'server-off'
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'denied' : 'off'
  const reg = await registration()
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  // A subscription made with an older server key can't receive anything; start over.
  if (sub && sub.options.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key) {
    await sub.unsubscribe(); sub = null
  }
  // Browsers without Google's push service (some Chromium forks) never answer; don't spin forever.
  sub ??= await Promise.race([
    reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }),
    new Promise<never>((_, no) => setTimeout(() => no(new Error("This browser didn't answer. Use Chrome, or check the phone is online, and try again.")), 20_000)),
  ])
  await send(sub, true)
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const sub = await current().catch(() => null)
  if (sub) {
    await staffApi.webPushUnsubscribe(sub.endpoint).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
  return 'off'
}

/** usePushAlerts: the state of this device's alerts, kept in sync with the server on every visit. */
export function usePushAlerts(enabled: boolean) {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const resync = useCallback(async () => {
    const s = await pushState().catch(() => 'unsupported' as PushState)
    setState(s)
    // Quietly re-send the subscription: the browser may have rotated it, or the row was cleaned up.
    if (s === 'on') { const sub = await current().catch(() => null); if (sub) send(sub, false).catch(() => {}) }
  }, [])

  useEffect(() => {
    if (!enabled) return
    resync()
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'ub-push-resubscribe') enablePush().then(setState).catch(() => {}) }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [enabled, resync])

  const toggle = async () => {
    setBusy(true); setError('')
    try { setState(state === 'on' ? await disablePush() : await enablePush()) }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't turn on alerts.") }
    finally { setBusy(false) }
  }
  return { state, busy, error, toggle }
}
