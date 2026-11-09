import { timeAgo } from '@project180/shared'
import { Button, ConfirmDialog, IconButton, Tooltip } from '@project180/ui'
import { History, Redo2, RotateCcw, Undo2 } from 'lucide-react'
import { type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'

const LIMIT = 200
/** Changes this close together (typing a name, painting days) undo as one step. */
const MERGE_MS = 600

/**
 * A draft with undo and redo. Drop-in for useState: setDraft takes a value or an updater.
 * Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z (or Ctrl+Y) redoes, except while typing in a field,
 * where the browser's own text undo applies.
 */
export function useDraftHistory<T>(initial: T) {
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initial,
    future: [],
  })
  const last = useRef(0)

  const setDraft = useCallback((action: SetStateAction<T>) => {
    setState((s) => {
      const next = typeof action === 'function' ? (action as (prev: T) => T)(s.present) : action
      if (Object.is(next, s.present)) return s
      const now = Date.now()
      const merge = now - last.current < MERGE_MS && s.past.length > 0
      last.current = now
      return {
        past: merge ? s.past : [...s.past, s.present].slice(-LIMIT),
        present: next,
        future: [],
      }
    })
  }, [])

  const undo = useCallback(() => {
    last.current = 0
    setState((s) => {
      const prev = s.past.at(-1)
      if (prev === undefined) return s
      return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future] }
    })
  }, [])

  const redo = useCallback(() => {
    last.current = 0
    setState((s) => {
      const [next, ...rest] = s.future
      if (next === undefined) return s
      return { past: [...s.past, s.present], present: next, future: rest }
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return {
    draft: state.present,
    setDraft,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

/** Undo, redo and "discard changes" for an editor header. */
export function HistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  dirty,
  onDiscard,
  what,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  dirty: boolean
  onDiscard: () => void
  what: string
}) {
  const [confirm, setConfirm] = useState(false)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const mod = mac ? '⌘' : 'Ctrl+'
  return (
    <div className="flex items-center gap-1">
      <IconButton
        label={`Undo (${mod}Z)`}
        icon={<Undo2 aria-hidden />}
        size="lg"
        disabled={!canUndo}
        onClick={onUndo}
      />
      <IconButton
        label={`Redo (${mac ? '⇧⌘Z' : 'Ctrl+Y'})`}
        icon={<Redo2 aria-hidden />}
        size="lg"
        disabled={!canRedo}
        onClick={onRedo}
      />
      {dirty && (
        <Tooltip label={`Go back to the last saved ${what}`}>
          <Button
            variant="ghost"
            icon={<RotateCcw className="size-4" aria-hidden />}
            onClick={() => setConfirm(true)}
          >
            Discard changes
          </Button>
        </Tooltip>
      )}
      <ConfirmDialog
        open={confirm}
        title="Discard your changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          onDiscard()
          setConfirm(false)
        }}
        onClose={() => setConfirm(false)}
      >
        The {what} goes back to how it was when you last saved. You can still press Undo straight
        after if you change your mind.
      </ConfirmDialog>
    </div>
  )
}

/**
 * Keeps a copy of unsaved changes in this browser, so a closed tab, a crash or a refresh doesn't
 * lose them. On opening the editor again, offers to bring them back.
 */
export function useDraftBackup<T>(
  key: string,
  draft: T,
  dirty: boolean,
  onRestore: (draft: T) => void,
) {
  const [stored, setStored] = useState<{ draft: T; at: string } | null>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as { draft: T; at: string }) : null
    } catch {
      return null
    }
  })
  const offered = useRef(stored !== null)

  useEffect(() => {
    // Don't overwrite the backup we're still offering to restore.
    if (offered.current) return
    const t = setTimeout(() => {
      try {
        if (dirty)
          localStorage.setItem(key, JSON.stringify({ draft, at: new Date().toISOString() }))
        else localStorage.removeItem(key)
      } catch {
        // Storage full or blocked: the editor still works, just without the safety copy.
      }
    }, 400)
    return () => clearTimeout(t)
  }, [key, draft, dirty])

  const clear = () => {
    offered.current = false
    setStored(null)
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }

  const banner = stored ? (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-sand/20 px-4 py-3">
      <History className="size-5 shrink-0 text-sand-text" aria-hidden />
      <p className="min-w-0 flex-1 font-semibold text-[14px]">
        You have unsaved changes from {timeAgo(stored.at).toLowerCase()} that never got saved.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            const d = stored.draft
            clear()
            onRestore(d)
          }}
        >
          Bring them back
        </Button>
        <Button size="sm" variant="ghost" onClick={clear}>
          Ignore
        </Button>
      </div>
    </div>
  ) : null

  return { banner, clear }
}
