import { Button, cn, IconButton } from '@project180/ui'
import {
  CopyCheck,
  GripVertical,
  HelpCircle,
  ListPlus,
  MousePointerClick,
  Scale,
  Undo2,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

const SEEN_KEY = 'project180-program-tips-seen'

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Private mode: the tips just show again next time.
  }
}

/**
 * How the program schedule works: shown the first time someone opens the editor on this device,
 * then tucked away behind the "How it works" button. Remembered per device.
 */
export function useProgramTips() {
  const [open, setOpen] = useState(() => !readSeen())
  return {
    open,
    show: () => setOpen(true),
    hide: () => {
      writeSeen()
      setOpen(false)
    },
  }
}

export function ProgramTipsButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton
      label="How the schedule works"
      icon={<HelpCircle aria-hidden />}
      size="sm"
      onClick={onClick}
    />
  )
}

const TIPS: Array<{ icon: ReactNode; title: string; text: string }> = [
  {
    icon: <MousePointerClick className="size-4" aria-hidden />,
    title: 'Click a day',
    text: 'Pick its workout or rest, turn the weigh-in on, edit the workout, or repeat it every week.',
  },
  {
    icon: <GripVertical className="size-4" aria-hidden />,
    title: 'Drag to swap',
    text: 'Grab a day and drop it on another. On a phone: open the day, then Swap with another day.',
  },
  {
    icon: <ListPlus className="size-4" aria-hidden />,
    title: 'Fill days',
    text: 'Choose a workout once, then click every day it goes on. Esc when you’re done.',
  },
  {
    icon: <Scale className="size-4" aria-hidden />,
    title: 'Weigh-in days',
    text: 'Tap the scale on a day to ask for a weigh-in. Gold means it’s on.',
  },
  {
    icon: <CopyCheck className="size-4" aria-hidden />,
    title: 'Whole weeks',
    text: 'Click a week’s name to copy it to every week, swap it with another or clear it.',
  },
  {
    icon: <Undo2 className="size-4" aria-hidden />,
    title: 'Undo anything',
    text: 'Undo in the corner (or Cmd/Ctrl+Z). Nothing changes for clients until you save.',
  },
]

export function ProgramTips({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.section
          aria-label="How the schedule works"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="relative flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-card md:p-6">
            <div className="flex items-start gap-3 pr-10">
              <div className="flex flex-col gap-1">
                <h2 className="font-bold text-[17px]">How the schedule works</h2>
                <p className="text-[13px] text-ink-muted">
                  Each row is a week, each box a day. Day 1 is the start date you pick when you
                  assign the program.
                </p>
              </div>
            </div>
            <IconButton
              label="Close tips"
              icon={<X aria-hidden />}
              size="sm"
              className="absolute top-4 right-4"
              onClick={onClose}
            />
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {TIPS.map((t) => (
                <li key={t.title} className="flex gap-3 rounded-md bg-surface-raised p-4">
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full bg-surface text-ink',
                      t.title === 'Weigh-in days' && 'bg-sand/25 text-sand-text',
                    )}
                  >
                    {t.icon}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-bold text-[14px]">{t.title}</span>
                    <span className="text-[13px] text-ink-muted">{t.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" className="self-start" onClick={onClose}>
              Got it
            </Button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
