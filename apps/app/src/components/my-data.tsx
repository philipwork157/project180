// Profile → Download my data: everything they logged, as one JSON file (POPIA's right of access).
import { Button } from '@project180/ui'
import { Download } from 'lucide-react'
import { useState } from 'react'

export function DownloadMyData() {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function download() {
    setPending(true)
    setFailed(false)
    try {
      const res = await fetch('/api/me/export', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `project180-my-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">Your data</h2>
        <p className="text-[14px] text-ink-muted">
          A copy of everything you’ve logged: workouts, food, water, weigh-ins and chats.
        </p>
      </div>
      <Button
        variant="secondary"
        block
        loading={pending}
        icon={<Download className="size-5" aria-hidden />}
        onClick={() => void download()}
      >
        Download my data
      </Button>
      {failed && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          Couldn’t download it. Check your signal and try again.
        </p>
      )}
    </section>
  )
}
