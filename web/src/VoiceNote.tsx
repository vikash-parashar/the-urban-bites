import { useEffect, useRef, useState } from 'react'
import { MButton } from './motion'

const MAX_SECONDS = 60

type SpeechRec = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function speechCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// VoiceNote lets the customer record a short message for the kitchen, or speak and have it typed into the note.
export default function VoiceNote({ blob, onBlob, onSpoken }: { blob: Blob | null; onBlob: (b: Blob | null) => void; onSpoken: (text: string) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [secs, setSecs] = useState(0)
  const [err, setErr] = useState('')
  const [listening, setListening] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const speech = useRef<SpeechRec | null>(null)
  const canRecord = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia
  const Speech = speechCtor()

  useEffect(() => {
    if (!blob) { setUrl(null); return }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  useEffect(() => {
    if (!rec) return
    const t0 = Date.now()
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000)
      setSecs(s)
      if (s >= MAX_SECONDS) rec.stop()
    }, 250)
    return () => clearInterval(id)
  }, [rec])

  async function start() {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported?.(t))
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined)
      const parts: BlobPart[] = []
      r.ondataavailable = (e) => e.data.size && parts.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setRec(null)
        const b = new Blob(parts, { type: r.mimeType || 'audio/webm' })
        onBlob(b.size > 0 ? b : null)
      }
      r.start()
      setSecs(0)
      setRec(r)
    } catch {
      setErr('Microphone is blocked. Allow it in your browser, or type the note.')
    }
  }

  function speak() {
    if (!Speech) return
    if (listening) { speech.current?.stop(); return }
    const s = new Speech()
    s.lang = 'hi-IN'
    s.interimResults = false
    s.continuous = false
    s.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').trim()
      if (text) onSpoken(text)
    }
    s.onend = () => setListening(false)
    s.onerror = () => { setListening(false); setErr("Couldn't hear that. Try again or type the note.") }
    speech.current = s
    setErr('')
    setListening(true)
    s.start()
  }

  if (!canRecord && !Speech) return null
  return (
    <div className="voice-note">
      <div className="voice-row">
        {canRecord && !rec && !blob && (
          <MButton type="button" className="btn btn-ghost btn-sm" onClick={start}>🎤 Record a voice note</MButton>
        )}
        {rec && (
          <MButton type="button" className="btn btn-danger btn-sm voice-live" onClick={() => rec.stop()}>
            <i className="rec-dot" aria-hidden="true" /> Stop · {secs}s / {MAX_SECONDS}s
          </MButton>
        )}
        {Speech && !rec && (
          <MButton type="button" className={`btn btn-ghost btn-sm ${listening ? 'voice-live' : ''}`} onClick={speak} aria-pressed={listening}>
            {listening ? '🛑 Listening… tap to stop' : '🗣️ Speak and we type it'}
          </MButton>
        )}
      </div>
      {blob && url && (
        <div className="voice-row">
          <audio controls src={url} preload="metadata" />
          <MButton type="button" className="btn btn-ghost btn-sm" onClick={() => onBlob(null)}>Delete</MButton>
        </div>
      )}
      {err && <span className="field-err">{err}</span>}
    </div>
  )
}
