import { Button, Input, Spinner } from '@project180/ui'
import { CameraOff, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

const PRODUCT_CODE = /^(\d{8}|\d{12,14})$/
/** How often a video frame is checked for a barcode. */
const SCAN_EVERY_MS = 200

type CameraState = 'starting' | 'scanning' | 'denied' | 'unavailable'

/**
 * The live camera with a frame to aim at. Finds a product barcode on its own, then stops the
 * camera and hands back the number. The number can always be typed instead.
 */
export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CameraState>('starting')
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const found = useRef(onCode)
  found.current = onCode

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const stop = () => {
      stopped = true
      clearTimeout(timer)
      for (const track of stream?.getTracks() ?? []) track.stop()
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setState('unavailable')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        })
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ''
        return setState(name === 'NotAllowedError' ? 'denied' : 'unavailable')
      }
      const el = video.current
      if (stopped || !el) return stop()
      el.srcObject = stream
      await el.play().catch(() => undefined)
      // The reader loads while the camera warms up.
      const { createDetector } = await import('../lib/barcode')
      const detector = createDetector()
      if (stopped) return
      setState('scanning')
      const tick = async () => {
        if (stopped) return
        try {
          if (el.readyState >= 2) {
            const [hit] = await detector.detect(el)
            const code = hit?.rawValue.trim()
            if (code && PRODUCT_CODE.test(code)) {
              stop()
              navigator.vibrate?.(30)
              found.current(code)
              return
            }
          }
        } catch {
          // A frame the reader couldn't use: try the next one.
        }
        timer = setTimeout(tick, SCAN_EVERY_MS)
      }
      void tick()
    }

    void start()
    return stop
  }, [])

  const typedValid = PRODUCT_CODE.test(typed)

  return (
    <div className="flex flex-col gap-5">
      {state === 'denied' || state === 'unavailable' ? (
        <div className="flex items-start gap-3 rounded-lg bg-surface-raised p-4">
          <CameraOff className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
          <p className="text-[14px]">
            {state === 'denied'
              ? 'Camera access is off for this app. Allow the camera in your browser’s site settings, or type the number under the barcode.'
              : 'This phone’s camera can’t be used here. Type the number under the barcode instead.'}
          </p>
        </div>
      ) : (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#202321]">
          <video
            ref={video}
            playsInline
            muted
            aria-label="Camera"
            className="size-full object-cover"
          />
          {/* Where to hold the barcode. */}
          <div
            aria-hidden
            className="absolute inset-x-[12%] top-1/2 h-[34%] -translate-y-1/2 rounded-md ring-2 ring-[#f5f3ed]/90"
          />
          <p
            aria-live="polite"
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-[#202321]/70 px-4 py-2.5 font-semibold text-[13px] text-[#f5f3ed]"
          >
            {state === 'starting' ? (
              <>
                <Spinner className="size-3.5" />
                Starting the camera…
              </>
            ) : (
              'Hold the barcode inside the frame'
            )}
          </p>
        </div>
      )}

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (typedValid) onCode(typed)
        }}
      >
        <label htmlFor={inputId} className="font-bold text-[13px] text-ink">
          Or type the number
        </label>
        <div className="flex gap-3">
          <Input
            id={inputId}
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={14}
            placeholder="6001234567890"
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
            className="tabular min-w-0 flex-1"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!typedValid}
            icon={<Search className="size-4" aria-hidden />}
          >
            Look up
          </Button>
        </div>
        <p className="font-semibold text-[13px] text-ink-muted">
          The 8 or 13 digits under the barcode.
        </p>
      </form>
    </div>
  )
}
