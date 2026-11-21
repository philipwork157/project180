import { Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from './button'
import { cn } from './cn'

// The browser's own speech-to-text (Web Speech API): free, no Claude tokens. Chrome, Edge and
// Safari have it; Firefox doesn't, so the button hides there. The page's Permissions-Policy must
// allow `microphone=(self)`.

interface SpeechResult {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechEvent {
  resultIndex: number
  results: ArrayLike<SpeechResult>
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionClass
    webkitSpeechRecognition?: RecognitionClass
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Joins what was already typed and what was said, with one space between. */
function join(base: string, spoken: string) {
  const said = spoken.trim()
  if (!said) return base
  return base.trim() ? `${base.replace(/\s+$/, '')} ${said}` : said
}

/**
 * "Speak" next to a text box: tap, talk, and the words are added to the box as you speak (live),
 * after anything already typed. Tap again (or pause) to stop. Hidden where the browser can't do it.
 */
export function DictateButton({
  value,
  onChange,
  disabled,
  maxLength,
  lang = 'en-ZA',
  className,
}: {
  value: string
  onChange: (text: string) => void
  disabled?: boolean
  maxLength?: number
  lang?: string
  className?: string
}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string>()
  const recognition = useRef<Recognition | null>(null)
  const base = useRef('')
  const finals = useRef('')
  const latest = useRef({ onChange, maxLength })
  latest.current = { onChange, maxLength }

  useEffect(() => setSupported(recognitionClass() !== null), [])
  // Stop listening when the box goes away (drawer closed).
  useEffect(() => () => recognition.current?.abort(), [])
  // Stop when the box is disabled (the build started).
  useEffect(() => {
    if (disabled) recognition.current?.stop()
  }, [disabled])

  if (!supported) return null

  const start = () => {
    const Rec = recognitionClass()
    if (!Rec) return
    setError(undefined)
    base.current = value
    finals.current = ''
    const r = new Rec()
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (!result) continue
        if (result.isFinal) finals.current += ` ${result[0].transcript}`
        else interim += ` ${result[0].transcript}`
      }
      const text = join(base.current, `${finals.current} ${interim}`)
      const { onChange: set, maxLength: max } = latest.current
      set(max ? text.slice(0, max) : text)
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        setError('Allow the microphone for this site to speak instead of typing.')
      else if (e.error === 'audio-capture') setError('No microphone found.')
      else if (e.error === 'network') setError('Speaking needs a connection. Try again.')
      // 'no-speech' and 'aborted' just stop quietly.
    }
    r.onend = () => {
      setListening(false)
      recognition.current = null
    }
    recognition.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      setError('Couldn’t start the microphone. Try again.')
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={listening ? 'primary' : 'secondary'}
          disabled={disabled}
          aria-pressed={listening}
          icon={
            listening ? (
              <Square className="size-4 fill-current" aria-hidden />
            ) : (
              <Mic className="size-4" aria-hidden />
            )
          }
          onClick={() => (listening ? recognition.current?.stop() : start())}
        >
          {listening ? 'Stop' : 'Speak instead'}
        </Button>
        {listening && (
          <span
            className="flex items-center gap-2 font-semibold text-[13px] text-ink-muted"
            aria-live="polite"
          >
            <span className="size-2 animate-pulse rounded-full bg-clay" aria-hidden />
            Listening… your words appear in the box.
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
