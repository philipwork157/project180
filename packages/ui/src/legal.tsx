// The terms of use and privacy policy, shared by both apps (/terms, /privacy). A plain starting
// draft written for South Africa (POPIA): have it checked by a lawyer before relying on it.
// Health and body details are "special personal information" under POPIA, so the policy says
// plainly what is kept, why, who sees it and how to delete it.
import type { ReactNode } from 'react'
import { LogoMark } from './logo'

export const LEGAL_UPDATED = '17 November 2026'
const CONTACT = 'hello@project180.co.za'

interface Section {
  id: string
  title: string
  body: ReactNode
}

const p = 'text-[15px] leading-[24px] text-ink'
const li = 'list-disc pl-5 text-[15px] leading-[24px] text-ink marker:text-ink-muted'

export const TERMS: Section[] = [
  {
    id: 'about',
    title: 'About these terms',
    body: (
      <p className={p}>
        These terms apply when you use Project 180: the phone app, the coaching dashboard and the
        emails they send. By creating an account you agree to them and to our privacy policy. If you
        don’t agree, please don’t use Project 180.
      </p>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: (
      <ul className="flex flex-col gap-2">
        <li className={li}>You must be 18 or older, or have a parent or guardian’s permission.</li>
        <li className={li}>
          Keep your password to yourself. You’re responsible for what happens on your account.
        </li>
        <li className={li}>
          Give true details. Your calorie estimates are only as good as the height, weight and
          activity you enter.
        </li>
      </ul>
    ),
  },
  {
    id: 'health',
    title: 'Not medical advice',
    body: (
      <p className={p}>
        Project 180 helps you train, log food and track progress. Calorie and macro targets, photo
        estimates and programs are general guidance, not medical, dietary or physiotherapy advice.
        Speak to a doctor before starting a new exercise or eating plan, especially if you are
        pregnant, breastfeeding, injured or have a medical condition. Stop and get help if something
        hurts.
      </p>
    ),
  },
  {
    id: 'coaches',
    title: 'Coaches',
    body: (
      <p className={p}>
        Coaches who use Project 180 run their own businesses. They are responsible for the programs
        and advice they give their clients, and for having their clients’ permission to keep their
        details. Project 180 provides the tools, not the coaching.
      </p>
    ),
  },
  {
    id: 'use',
    title: 'Using it fairly',
    body: (
      <ul className="flex flex-col gap-2">
        <li className={li}>
          Don’t misuse it: no breaking in, scraping, overloading or creating accounts in bulk.
        </li>
        <li className={li}>Only upload photos and content you have the right to use.</li>
        <li className={li}>
          We may limit or close accounts that break these terms or put others at risk.
        </li>
      </ul>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and ending',
    body: (
      <p className={p}>
        We may change Project 180 or these terms; we’ll tell you in the app or by email when it
        matters. You can stop using it and delete your account at any time from Profile in the app.
        To the extent the law allows, Project 180 is provided as it is, and we aren’t liable for
        indirect loss. These terms are governed by South African law.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p className={p}>
        Questions? Email{' '}
        <a href={`mailto:${CONTACT}`} className="font-bold text-brand-text">
          {CONTACT}
        </a>
        .
      </p>
    ),
  },
]

export const PRIVACY: Section[] = [
  {
    id: 'who',
    title: 'Who we are',
    body: (
      <p className={p}>
        Project 180 is responsible for your personal information under the Protection of Personal
        Information Act (POPIA). Our Information Officer can be reached at{' '}
        <a href={`mailto:${CONTACT}`} className="font-bold text-brand-text">
          {CONTACT}
        </a>
        .
      </p>
    ),
  },
  {
    id: 'what',
    title: 'What we keep',
    body: (
      <ul className="flex flex-col gap-2">
        <li className={li}>Your name, email and password (stored scrambled, never readable).</li>
        <li className={li}>
          Health and body details you enter: birth date, sex, height, weigh-ins, measurements,
          goals, injuries or notes, and how you feel after workouts. POPIA calls this special
          personal information; we keep it only because you give it to us to use the app.
        </li>
        <li className={li}>What you log: workouts and sets, food, water, steps and activities.</li>
        <li className={li}>
          How you use the app: when you were last active, roughly how long, and which devices you’re
          signed in on.
        </li>
        <li className={li}>Messages between you and your coach.</li>
      </ul>
    ),
  },
  {
    id: 'why',
    title: 'Why we use it',
    body: (
      <p className={p}>
        To run the app for you: your program, your progress, your daily targets and reminders, and,
        if you have one, your coach’s view of how you’re doing. We don’t sell your information, and
        we don’t use it for advertising.
      </p>
    ),
  },
  {
    id: 'who-sees',
    title: 'Who sees it',
    body: (
      <ul className="flex flex-col gap-2">
        <li className={li}>You.</li>
        <li className={li}>
          Your coach and their business, if you have one: they see your training, food, body details
          and messages so they can coach you.
        </li>
        <li className={li}>
          The Project 180 team, only when needed to run, fix or secure the service.
        </li>
        <li className={li}>
          Services that run parts of it for us: Cloudflare (hosting and the database), Amazon Web
          Services (email) and Anthropic (reading a food photo you take; the photo is used for that
          one estimate and not stored). Some of these are outside South Africa; they protect your
          information under their own data protection terms.
        </li>
      </ul>
    ),
  },
  {
    id: 'keep',
    title: 'How long we keep it',
    body: (
      <p className={p}>
        For as long as you have an account. When you delete your account, your details and
        everything you logged are deleted straight away. Anonymous totals (for example, how many
        food photos were read) may remain, without anything that identifies you.
      </p>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <ul className="flex flex-col gap-2">
        <li className={li}>See and correct your details in the app, or ask us for a copy.</li>
        <li className={li}>
          Delete your account and everything with it: Profile → Delete my account.
        </li>
        <li className={li}>
          Object to how we use your information, or complain to the Information Regulator
          (inforegulator.org.za) if you think we got it wrong. Please tell us first so we can fix
          it.
        </li>
      </ul>
    ),
  },
  {
    id: 'security',
    title: 'Keeping it safe',
    body: (
      <p className={p}>
        Everything travels encrypted, passwords are stored scrambled, sign-ins are limited to stop
        guessing, and coaches only ever see their own clients. If something ever goes wrong with
        your information, we’ll tell you and the Information Regulator as POPIA requires.
      </p>
    ),
  },
]

/**
 * A legal page: the logo and title, a contents list beside the text on wide screens (above it
 * on phones), and the sections. Full width; the text keeps a readable line length.
 */
export function LegalPage({
  title,
  sections,
  back,
}: {
  title: string
  sections: Section[]
  /** A link back (e.g. to sign up or Profile). */
  back: ReactNode
}) {
  return (
    <div className="min-h-dvh w-full bg-bg px-4 pt-safe pb-safe md:px-8 lg:px-12">
      <header className="flex items-center gap-3 py-6">
        <LogoMark className="size-9 text-ink" title="Project 180" />
        <div className="flex-1" />
        {back}
      </header>
      <div className="grid grid-cols-1 gap-8 pb-16 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:gap-12">
        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <div className="flex flex-col gap-1">
            <h1 className="font-display font-extrabold text-[30px] leading-[34px] tracking-tight">
              {title}
            </h1>
            <p className="text-[13px] text-ink-muted">Last updated {LEGAL_UPDATED}</p>
          </div>
          <nav aria-label="Contents" className="flex flex-col gap-1">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex min-h-11 items-center rounded-md px-3 font-semibold text-[14px] text-ink-muted transition hover:bg-surface-raised hover:text-ink"
              >
                {s.title}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="flex scroll-mt-6 flex-col gap-3">
              <h2 className="font-bold text-[19px]">{s.title}</h2>
              <div className="max-w-[72ch]">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
