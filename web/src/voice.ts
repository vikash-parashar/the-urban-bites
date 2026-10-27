// Spoken order updates in Haryanvi (Hindi as the fallback voice).
// Each line plays a recorded clip from /voice/hr/<key>.mp3 when one is uploaded; until then the
// phone's own Hindi voice reads the Devanagari text. Clips can be dropped into web/public/voice/hr/
// with these exact names, and they take over automatically.

export type VoiceKey =
  | 'placed'
  | 'cooking' | 'cooking_5' | 'cooking_10' | 'cooking_15' | 'cooking_20' | 'cooking_30' | 'cooking_45'
  | 'ready_pickup' | 'ready_delivery' | 'on_the_way' | 'delivered' | 'collected'
  | 'paid' | 'payment_pending' | 'cancelled'
  | 'staff_new_order' | 'rider_new_delivery' | 'rider_order_ready'

// Haryanvi lines. Keep them short: they are read out on a phone speaker.
export const LINES: Record<VoiceKey, string> = {
  placed: 'भाई जी, द अर्बन बाइट्स पै ऑर्डर करण खातर घणा धन्यवाद! थोड़ा सबर राखियो, ऑर्डर की सारी खबर इसे पेज पै मिलती रहवैगी।',
  cooking: 'थारा ऑर्डर बण रह्या सै। थोड़ी देर म्है तैयार हो ज्यागा।',
  cooking_5: 'थारा ऑर्डर बण रह्या सै। बस पाँच मिनट म्है तैयार हो ज्यागा।',
  cooking_10: 'थारा ऑर्डर बण रह्या सै। बस दस मिनट म्है तैयार हो ज्यागा।',
  cooking_15: 'थारा ऑर्डर बण रह्या सै। पंद्रह मिनट म्है तैयार हो ज्यागा।',
  cooking_20: 'थारा ऑर्डर बण रह्या सै। बीस मिनट म्है तैयार हो ज्यागा।',
  cooking_30: 'थारा ऑर्डर बण रह्या सै। आध घंटे म्है तैयार हो ज्यागा।',
  cooking_45: 'थारा ऑर्डर बण रह्या सै। पैंतालीस मिनट म्है तैयार हो ज्यागा।',
  ready_pickup: 'भाई जी, थारा ऑर्डर तैयार सै! आ कै ले ज्याओ।',
  ready_delivery: 'थारा ऑर्डर पैक हो ग्या सै, जल्दी ए निकलैगा।',
  on_the_way: 'थारा ऑर्डर चाल पड़्या सै! राइडर रस्ते म्है सै, फोन चालू राखियो।',
  delivered: 'ऑर्डर पहोंच ग्या! खाणे का स्वाद ल्यो, अर द अर्बन बाइट्स नै याद राखियो।',
  collected: 'ऑर्डर ले लिया! खाणे का स्वाद ल्यो, अर द अर्बन बाइट्स नै याद राखियो।',
  paid: 'भाई जी, थारी पेमेंट मिल गी सै। घणा धन्यवाद!',
  payment_pending: 'पेमेंट अजे बाकी सै। डिलीवरी पै नकद दे दियो या यू पी आई तै भेज दियो।',
  cancelled: 'माफ करियो भाई जी, थारा ऑर्डर कैंसिल हो ग्या सै। कोए बात हो तो फोन कर लियो।',
  staff_new_order: 'नया ऑर्डर आया सै! फोन देख ल्यो।',
  rider_new_delivery: 'डिलीवरी का नया ऑर्डर आया सै! फोन देख ल्यो।',
  rider_order_ready: 'ऑर्डर तैयार सै, ले कै निकल ल्यो।',
}

const KEY = 'ub-voice'
export function voiceOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}
export function setVoiceOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode */ }
}

const missing = new Set<VoiceKey>()
let queue: Promise<void> = Promise.resolve()

function speakText(text: string): Promise<void> {
  return new Promise((done) => {
    const synth = window.speechSynthesis
    if (!synth) return done()
    const u = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    u.voice = voices.find((v) => v.lang === 'hi-IN') ?? voices.find((v) => v.lang.startsWith('hi')) ?? null
    u.lang = 'hi-IN'
    u.rate = 0.95
    u.onend = () => done()
    u.onerror = () => done()
    synth.speak(u)
    setTimeout(done, 12_000)
  })
}

function playClip(key: VoiceKey): Promise<boolean> {
  if (missing.has(key)) return Promise.resolve(false)
  return new Promise((done) => {
    const a = new Audio(`${import.meta.env.BASE_URL}voice/hr/${key}.mp3`)
    a.onended = () => done(true)
    a.onerror = () => { missing.add(key); done(false) }
    a.play().catch(() => { done(false) })
  })
}

/** say plays one update out loud (recorded clip first, phone voice otherwise). Calls queue up. */
export function say(key: VoiceKey, force = false) {
  if (!force && !voiceOn()) return
  queue = queue.then(async () => {
    if (!(await playClip(key))) await speakText(LINES[key])
  })
}

/** cookingKey picks the clip for the ready time the owner set. */
export function cookingKey(mins: number | null | undefined): VoiceKey {
  const k = `cooking_${mins}` as VoiceKey
  return k in LINES ? k : 'cooking'
}
