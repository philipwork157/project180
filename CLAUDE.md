# Project 180 — notes for Claude

- Monorepo: Bun workspaces + Turborepo. Run `bun run check` before finishing a change.
- Two apps: apps/app (phone PWA, :5173) and apps/admin (dashboard, :5174). Each has its own Worker mounting packages/api at /api; both bind the same D1 database. Locally only apps/app runs workerd; apps/admin proxies /api to :5173. Shared browser code goes in packages/client, shared UI in packages/ui.
- Stack: React 19 + Vite + TanStack Router/Query + Tailwind v4; Hono + Better Auth + Drizzle on D1.
- Styles: use the token utilities from packages/ui/src/tokens.css (`bg-surface`, `text-ink`, `bg-brand`, `text-on-brand`, `bg-lime` …). Never hard-code colours, except the fixed brand charcoal `#202321` / off-white `#f5f3ed` on surfaces that are charcoal in both themes (auth, hero cards, celebration, rest timer). Every screen must work in light and dark.
- Schema changes: edit packages/db/src/schema, then `bun run db:generate`. Never hand-edit generated migrations.
- API: every route touching personal data uses `requireUser` and filters by `c.var.user.id`. Add a privacy test in packages/api/test for each new resource.
- Shared logic (dates, stats, validation) lives in packages/shared with unit tests.
- Code style: Biome (single quotes, no semicolons, 2 spaces, 100 cols).
- Forms: always use Field + Input/Select/Textarea from @project180/ui. Never a bare <select>: the Select component removes the browser arrow and draws a chevron 12px inside the right edge (pr-10).
- Icon-only actions: always IconButton from @project180/ui (square, tooltip + aria-label built in). Never a padded Button with only an icon.
- Admin add/edit/assign flows open a Drawer (side panel); assigning always uses AssignForm.
- cn() uses tailwind-merge, so a className passed to a component overrides its defaults.
- Dates: always use DatePicker from @project180/ui (react-day-picker, Monday-first), never <input type="date">.
- Layout: full width at every screen size, no max-width page columns. Grow padding (px-4 md:px-8 lg:px-12) and add grid columns instead.
- Deleting: only with ConfirmDialog. Library items in use (workouts, logged history) are archived, never deleted; the API refuses with 409.

## Phone app (apps/app): every feature must feel native on a phone AND look good in a browser

Design and build every screen phone-first, then check it at desktop width. Before calling a feature done:

- **Phone (375–430px wide):** one column, 16px side padding, nothing cut off or scrolling sideways. Tap targets at least 44px; the main action is a large button within thumb reach (bottom of the screen or a bottom sheet). Respect the notch and home indicator (pt-safe / pb-safe). Numbers you type use the numeric keypad (inputMode).
- **Native feel:** instant feedback on every tap (press scale, optimistic updates), smooth Motion transitions, bottom sheets instead of new pages for quick actions, no hover-only actions, no browser-default controls (dates use DatePicker, selects use Select), works in light and dark, and keeps working with poor signal where it matters (the workout screen).
- **Browser (laptop/desktop):** full width, no narrow centred column. Grow the padding (md:px-8 lg:px-12) and use more grid columns instead of stretching inputs across the screen.
- **Users never see admin:** nothing in apps/app links to, mentions or hints at the admin dashboard. Admin features live only in apps/admin.
- Don't show settings that never change for us (weights are always kg; the time zone is always Africa/Johannesburg).

## Speed and fresh data (both apps)

- After a change, update the cache from the server's reply (`setQueryData`) or optimistically, then navigate straight away. Never `await invalidateQueries(...)` before closing a sheet or leaving a screen: it waits for a full reload. Invalidate with `void` in the background.
- "Workout in progress" comes from `planQuery().activeSession`: starting sets it, finishing/discarding clears it in the cache immediately.
- Signing in clears the whole query cache (shared phones); any 401 clears it and goes to /login (main.tsx).
- API routes: run independent D1 reads with `Promise.all`, and aggregate in SQL (count, max, group by) instead of loading rows to count them in JS.
- The workout screen waits for sets still saving (`flushSets`) before finishing; a finished session can't be reopened.

## Spacing and layout (both apps)

- Every responsive grid starts with `grid-cols-1` (or another explicit count), e.g. `grid grid-cols-1 xl:grid-cols-[…]`. A bare `grid` lets long text widen the column past the phone screen.
- Rows of tabs or chips that can't wrap neatly scroll sideways on phones (`no-scrollbar overflow-x-auto`, chips `shrink-0 whitespace-nowrap`). Check every admin page at 375px wide before calling it done.

One spacing scale, so screens never look cramped or doubled up:

- **Page:** the layouts already pad `<main>` (`px-4 md:px-8 lg:px-12`, `py-6 lg:py-10`). Pages never add their own outer padding.
- **Admin page order:** `PageHeader` (it carries `mb-6`) → `Toolbar` (tabs, filters, sort; carries `mb-4`) → content. Don't wrap these in another `gap-*` container (that doubles the space) and never put a toolbar row directly on top of a card without `Toolbar`.
- **Cards:** `Card` is `p-5 md:p-6`. Don't override its padding, except `p-0 md:p-0` for edge-to-edge lists. Grids of cards use `gap-5`.
- **Inside a card:** sections `gap-5`; a group of fields `gap-4`; a label above its value `gap-1`; chips and small inline items `gap-2`; icon + text rows `gap-3`. Nested info blocks are `rounded-md bg-surface-raised p-4`.
- **Never** put text, numbers, chips, bars or icons side by side without a `gap-*` (at least `gap-2`). A small-caps label (`font-extrabold text-[11px] uppercase tracking-[0.08em] text-ink-muted`) sits `mt-1` above its value.
- Check every screen at 375px and 1440px wide, in light and dark, before calling it done.

## Admin shell

- The sidebar collapses to an icon rail (remembered per device); collapsed items show a `Tooltip side="right"`. The signed-in person sits at the bottom (`UserMenu` in apps/admin/src/components/user-menu.tsx) with Settings, the theme switch, Open the phone app and Sign out. Settings live at `/settings`.

## Feedback after an action (admin)

- Editors (workouts, programs) keep their draft in `useDraftHistory` (undo/redo, Cmd/Ctrl+Z), show `HistoryControls` (Undo, Redo, Discard changes) and keep a browser safety copy with `useDraftBackup` (apps/admin/src/components/draft-history.tsx). New editors do the same.
- Any editor with a save button uses `useUnsavedChangesGuard` (apps/admin/src/components/unsaved-changes.tsx): our own "Leave without saving?" dialog for in-app navigation. Never use `window.confirm`.

- After a save, archive, delete, assign or reset, call `toast({ title, description? })` from `@project180/ui`. It shows bottom-right (bottom-centre on phones) and hides itself. Never put inline "Saved" text in headers. `<Toaster />` is mounted once in `apps/admin/src/routes/__root.tsx`.
- Use `tone: 'error'` only for failures that aren't already shown next to the form.
- Bulk edits in an editor (copy a week to every week, clear, etc.) show a toast with `action: { label: 'Undo', onClick }` that restores the previous draft.
- Theme changes go through `setThemePreference` (one cross-fade via the View Transitions API); never toggle `data-theme` directly.

## Project 180 brand (design system)

- **Core:** charcoal `#202321`, lime `#B6E63B`, warm off-white `#F5F3ED`, muted grey `#777C78`. Tagline: TRAIN. FUEL. FEEL. LIVE.
- **Lime is an accent, never a page or big-card background.** It means done, progress, records, the logo arc, and the main action on charcoal. Big "done" moments are a surface card with a lime check and a lime edge, not a lime block.
- **brand** changes with the theme: charcoal buttons in light mode, lime buttons in dark mode. `brand-text` is olive in light (lime text is unreadable on off-white) and lime in dark. Use `text-brand-text` for links.
- **Supporting colours are muted and only carry meaning:** `clay` effort/volume/live workout, `steel` time/rest, `sand` feeling/weigh-ins/body weight, `mauve` second series/glutes. Use them as tints (`bg-clay/20 text-clay-text`), thin edges or dots, not big fills.
- **Hero cards** (today's workout, no program, auth, celebration) are charcoal in both themes with the `TurnArc` (the 180° arc) as the only decoration. No blobs, no gradients.
- **Sign-in screens** use `AuthShell` (packages/ui/src/auth-shell.tsx): one brand idea, the `TurnDial` (a 180° instrument dial), a calm story line on desktop, and a plain form. No kicker labels above headings, no repeated taglines, no coloured glows (`shadow-brand` is a quiet shadow in dark mode).
- **Type:** Archivo for display and numbers; `.metric` = heavy italic tabular numbers (stats, timers, weights). Plus Jakarta Sans for everything else.
- **Logo:** `LogoMark` (the P whose bowl is a 180° arc), `Logo` (mark | PROJECT 180), `Wordmark`, `AppIcon`, `Tagline` in packages/ui/src/logo.tsx. Icons in apps/app/public/icons.
- **Motion:** meaningful and calm. Arcs draw, checks pop, numbers rise. Confetti only on finishing a workout, in lime/off-white/sand.

## Accounts

- No self-registration anywhere: Better Auth `disableSignUp`, and there is no setup page or endpoint. Never add one.
- Staff are created with `bun run admin:create[:dev|:live]` (packages/api/scripts/create-admin.ts, SQL in packages/api/src/admin-sql.ts, also used by the tests). Everyone else is added from the admin.
- Roles: `owner` (sees everyone), `admin` = coach (sees self + clients with `coach_id` = them), `member` = client. Use `isStaff` / `isOwner` from `@project180/shared`, never `role === 'admin'`. Any route that touches another person goes through `managedPerson` / `managedUsers` in packages/api/src/access.ts (404 if not theirs).

- Passwords set by staff are temporary: `users.must_change_password` is set on create and on reset (a reset also deletes their sessions). While it's set, `requireUser` only allows `GET /me` and `POST /me/first-password`; both apps redirect to `/choose-password`. Keep that guard on every new signed-in route tree.
- Sessions are sliding, `SESSION_DAYS` per Worker (app 30, admin 7). Sign-in goes through the limiter in packages/api/src/sign-in-limit.ts (5 per email, 20 per IP, 15 minutes); don't add another sign-in path around it.
- Activity: `users.last_seen_at` (written by `requireUser`, at most every 2 minutes), `app_activity` (seconds per day from `POST /me/heartbeat`, sent by `useHeartbeat` in the app) and the sessions table (devices). Only staff who manage the person can see it (`/admin/users/:id/activity`). Clients are told in the welcome email; keep that line if you change the template.

## Programs, copies and history

- The library is staff-only (`requireAdmin` on /exercises, /workouts, /programs, /enrollments). No visibility or publish flags: `visibleTo` in packages/api/src/library.ts decides. Owners see all; coaches see every exercise but only workouts/programs they created (plus their clients' copies); clients see only their own copies, through /me/plan and sessions. Don't add a client-facing library or self-start.

- Assigning a program (`POST /enrollments`) makes the client's own copy of the program and its workouts (`client_id`, `source_*_id`). Library lists filter with `libraryOnly`; never show copies there. Saving a client copy re-homes any library workouts into copies.
- Starting a session snapshots the workout's targets and groups into `session_exercises`; session detail reads the snapshot first. Don't read live `workout_exercises` for history.
- Reps: a range (`target_reps_min/max`) or set by set (`target_reps_per_set`, JSON array; the validator makes `targetSets` its length and min/max its lowest/highest). `bodyweight` on a workout row means reps only. Both are snapshotted into `session_exercises`. Show reps with `repsLabel` from shared.
- Exercise search uses `matchesExercise` (name + `keywords` + muscle group). Seed search words live in packages/db/seed/keywords.ts.
- Exercise groups: `workout_exercises.superset_group` + `workout_groups` (kind superset | circuit | interval, rounds, work/rest seconds).
- A workout can't be deleted for good while any program schedules it (`purgeWorkout` answers 409 and the dialog lists the programs to fix first). Archiving is always allowed; programs keep working with archived workouts.
- D1 allows at most 100 bound values per statement. Multi-row inserts must go through `insertMany` + `runAll` (packages/api/src/batch.ts), never a bare `.values(array)`.
- Schema changes need a migration in packages/db/drizzle (and its meta snapshot); apply with `bun run db:migrate` locally and `bun run db:migrate:dev` before deploying.
- Password fields always use `PasswordInput` from `@project180/ui` (eye button to show/hide), never a bare `type="password"` Input.

## Email

- Send only through `sendEmail(env, …)` in packages/api/src/email.ts (AWS SES v2 as a hand-signed `fetch`, Signature V4 with WebCrypto; never use the AWS SDK in the Worker, it crashes in workerd). Templates live there too and use the brand shell.
- `EMAIL_REDIRECT_TO` (set in the dev environment) must keep redirecting every email; never bypass it. Without AWS keys, emails are logged, so tests and local dev never send.
- Safety net: on a local/dev/workers.dev site (`isTestSite`) with no `EMAIL_REDIRECT_TO`, `sendEmail` only logs, even with AWS keys. Settings > Email shows the mode (`GET /api/admin/email`) and sends a test (`POST /api/admin/email/test`).

## Exercise photos (licensing matters: read before adding any image)

- Photos are bundled in the phone app: `apps/app/public/exercise-images/<id>/0.webp` (start) and `1.webp` (finish), about 720px, WebP. `exercises.image_key` is `exercise-images/<id>`; build URLs with `exercisePhotos()` from shared (the admin passes `APP_URL`). The phone app's service worker caches them on first view (not precached).
- The mapping lives in `packages/db/seed/images.ts` (our exercise name -> source id). `bun run db:seed` fills `image_key` only where it is empty, so photos an owner sets are never overwritten.
- **Only use images whose licence lets us use them in a commercial app, and record the source.** The approved source is **free-exercise-db** (github.com/yuhonas/free-exercise-db, Unlicense = public domain, no credit required). Clone it with `git clone --depth 1 https://github.com/yuhonas/free-exercise-db`, take `exercises/<id>/0.jpg` and `1.jpg`, resize to 720px and save as WebP.
- When you add new exercises, look for a match in free-exercise-db first. A match must be the **same movement with the same equipment** (a kettlebell photo is not a dumbbell exercise; a partner stretch is not a solo stretch). Check every new photo by eye before adding it (open the images; don't trust names alone). If there is no clear match, add no photo: the form cue is shown instead.
- Other open sources need credit and share-alike (wger: CC BY-SA 3.0; Everkinetic drawings: CC BY-SA 3.0). Only use them if we also add a visible credits page with each image's author and licence. Never use images from Google, Pinterest, YouTube stills, other apps or paid libraries without a written licence.
- Pelvic floor, pregnancy and postnatal exercises get no stock photos: only the coach's own photos, because how these are shown matters.
- Coaches upload their own photos in the exercise drawer (`POST /exercises/:id/photos`, start + optional finish). They go to the R2 bucket `MEDIA` under `uploads/` (served by `GET /api/media/uploads/...`), shrunk in the browser first, and `image_key` becomes `uploads/exercises/<id>/<random>:<count>`. Removing sets `image_key = 'none'` so the seed never puts a stock photo back. Uploads always win over stock photos.
- In-app videos use the official YouTube embed (`youtubeEmbedUrl`, youtube-nocookie) and the YouTube Data API search (`GET /api/videos?exerciseId=`, cached 30 days in `video_searches`, key in `YOUTUBE_API_KEY`). Coach-chosen videos are labelled as such; search results are labelled "not checked by your coach".
- Every exercise has a video button. In the admin it's `VideoButton` (components/video-dialog.tsx): a pop-up with the chosen video, YouTube results to play and "Use this video", photos and instructions. Don't link out of the dashboard for videos; the only external link is the "Search on YouTube" fallback when there's no API key. Never embed scraped videos or save frames as photos.
- Each exercise can also have a `video_url` (YouTube/Vimeo link chosen by the coach); the app shows "Watch the video". We link to videos, never download or re-host them.
