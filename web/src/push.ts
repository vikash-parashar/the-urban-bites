// Phone notifications in the Android app. The app gets a push address (a Firebase token) and hands it
// to the page as window.ubPushToken plus an 'ub-push-token' event. The page then tells the server who
// should hear what: a signed-in staff phone gets new orders, a customer's phone gets their order's updates.
// In a normal browser there is no token and nothing here does anything.

declare global {
  interface Window { ubPushToken?: string }
}

/** Calls cb with the app's push token now (if known) and again whenever the app hands over a new one. */
export function onPushToken(cb: (token: string) => void): () => void {
  let last = ''
  const fire = () => {
    const t = window.ubPushToken
    if (t && t !== last) { last = t; cb(t) }
  }
  fire()
  window.addEventListener('ub-push-token', fire)
  return () => window.removeEventListener('ub-push-token', fire)
}

export const currentPushToken = () => window.ubPushToken || ''
