# Project 180

A private fitness tracker for two: a phone app (installable PWA) for logging every set, and a separate admin dashboard for building exercises, workouts and programs. Runs on Cloudflare: two Workers sharing one D1 database.

## First-time setup

You need [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`).

```bash
bun install                 # packages + git hooks
bun run db:generate         # writes SQL migrations from the schema
bun run db:migrate          # creates the local D1 database
bun run format              # tidy formatting once
bun run check               # lint + typecheck + tests
bun run dev                 # app http://localhost:5173 · admin http://localhost:5174
```

Create your admin account(s) with `bun run admin:create` (it asks for name, email and a hidden password, and can add several in one go). There is no sign-up page: everyone else is added in the admin under **Users → Add person**, and signs in to the app with the email and temporary password you give them.

The local database lives in `.wrangler/state` at the repo root. Locally the phone app runs the API and database; the admin dev server forwards `/api` to it, so start them together with `bun run dev`.

Each app has a `.dev.vars` with local secrets (already created, not committed). See `.dev.vars.example` in each app. The apps find each other through `VITE_ADMIN_URL` / `VITE_APP_URL` in their `.env.*` files.

To try it on your phone, run `bun run dev -- --host` and open your Mac's IP on port 5173 on the same Wi-Fi. Installing to the home screen needs HTTPS, so use the deployed site for that.

## Everyday commands

| Command               | What it does                                                                  |
| --------------------- | ----------------------------------------------------------------------------- |
| `bun run dev`         | App + API + local database, with hot reload                                   |
| `bun run check`       | Biome lint, TypeScript, unit and API tests                                    |
| `bun run test`        | Unit tests (shared) and API tests (Workers runtime + D1)                      |
| `bun run e2e`         | Playwright on a phone-sized screen (`bunx playwright install chromium` first) |
| `bun run format`      | Format and fix with Biome                                                     |
| `bun run db:generate` | New migration after changing `packages/db/src/schema`                         |
| `bun run db:migrate`  | Apply migrations locally                                                      |

## Accounts, coaches and clients

Nobody can register themselves. Staff are created from the command line, straight into the database:

```bash
bun run admin:create         # local database
bun run admin:create:dev     # Cloudflare dev (dev.project180.co.za)
bun run admin:create:live    # live (project180.co.za)
```

It asks for a name, an email, **owner or coach**, and a password (typed hidden, hashed on your machine; only the hash is sent). Running it again for an existing email updates their role and password and signs them out everywhere.

| Role       | Sees                                                                                            | Can                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Owner**  | every coach and client, and every exercise, workout and program                                 | add coaches and clients, pick or change anyone's coach, edit anything in the library                   |
| **Coach**  | themselves and the clients they added; every exercise; only the workouts and programs they made | add clients (they become theirs), build workouts and programs, assign and edit their clients' programs |
| **Client** | themselves and the program assigned to them                                                     | train; never sees the library, can't pick a program themselves                                         |

This follows how coaching platforms such as Everfit and Trainerize split admins (see all clients) from trainers (see their own).

## Signing in, staying signed in and activity

**Temporary passwords.** The password you type when adding someone (or when you reset one with the key button) is temporary. The first time they sign in, the app asks them to choose their own (typed twice, not the temporary one), and nothing else works until they do; other devices still on the temporary password are signed out. A reset also signs them out everywhere straight away. Passwords made with `admin:create` are not temporary.

**How long people stay signed in.** Sign-ins are sliding: the app keeps you signed in for **30 days** after you last used it, the admin for **7 days** (`SESSION_DAYS` in each app's `wrangler.jsonc`). Using it renews the clock, so someone who opens the app weekly never has to sign in again. The app and admin cookies are separate: signing out of one doesn't sign you out of the other.

**Wrong passwords.** After 5 wrong passwords for one email within 15 minutes, that email is paused for 15 minutes (the screen says how long). One network address gets 20 tries in the same window. A right password resets the email's count.

**Activity.** Every person's card shows a green dot when they've used the app in the last 5 minutes, otherwise when they were last seen; how many days and how long they had the app open in the last 7 days (the app reports time while it's on screen, about once a minute); and the devices they're signed in on, each with a sign-out button, plus **Sign out of all devices**. Sort the list by **Last seen** to spot who has gone quiet. The welcome email tells clients this is recorded (POPIA).

**The library is for staff.** There's no "who can see it" setting: exercises are shared by all coaches, while a workout or program is seen only by the coach who made it and the owners. Clients see nothing in the library; they get their program (and its workouts) when a coach assigns it.

**Programs are copied when assigned.** Each person gets their own copy of the program and its workouts, so their coach can change it ("make Sam's squats lighter") without touching the library or anyone else. Edit it from the person's card: **Edit Sam's version**. Library lists never show these copies. Removing or deleting a person's program also removes their copy; archiving keeps it.

**Sessions keep what was prescribed.** When a workout starts, its targets (sets, reps, rest, groups) are saved with the session, so history shows what was asked even if the workout changes later.

**Reps set by set, and bodyweight.** In the workout builder, "Set by set" next to Reps lets you prescribe each set (12, 10, 10, 8) instead of a range; the app pre-fills each set with its own target. The **Bodyweight** tag under an exercise's name means clients log reps only, no weight, for that workout.

**Supersets, circuits and intervals.** In the workout builder, "Link with next" joins exercises into a block with rounds and rest (superset or circuit) or work/rest seconds (intervals, e.g. Tabata 8 × 20s/10s). In the app, a block shows as one card; rest starts after the whole round, and interval blocks have a full-screen timer that logs the sets when it finishes.

## Email (Amazon SES)

The API sends email with the AWS SDK (`@aws-sdk/client-sesv2`, in `packages/api/src/email.ts`): the welcome email with sign-in details from the new-client wizard, and a temporary password when a coach resets one.

- **Local and tests:** without AWS keys nothing is sent; the email is printed in the terminal.
- **Cloudflare dev:** `EMAIL_REDIRECT_TO` (in `env.dev` of both `wrangler.jsonc` files) sends **every** email to philipwork157@gmail.com instead, with "[DEV for real@person]" in the subject and a banner, so testing never emails real clients.
- **Live:** sends to the real person. Remove nothing; just don't set `EMAIL_REDIRECT_TO`.

To switch it on, verify the sender domain (`project180.co.za`) in SES in `af-south-1` (Cape Town), create an IAM user that may only `ses:SendEmail`, then for each Worker:

```bash
cd apps/app   && bunx wrangler secret put AWS_ACCESS_KEY_ID --env dev && bunx wrangler secret put AWS_SECRET_ACCESS_KEY --env dev
cd ../admin   && bunx wrangler secret put AWS_ACCESS_KEY_ID --env dev && bunx wrangler secret put AWS_SECRET_ACCESS_KEY --env dev
```

(Drop `--env dev` for live.) New SES accounts start in the sandbox and can only send to verified addresses, which is fine for dev since everything goes to the one developer address; request production access before going live.

## Starter library

`bun run db:seed` fills the library with about 660 exercises (each with a form cue and search words, so "hamstrings" or "pelvic floor" finds them) and 19 workouts, owned by the first owner: about 490 strength, 120 mobility (warm-ups, stretches, yoga, foam rolling) and 50 cardio. It covers bodybuilding staples, machines and cables, kettlebells, bands, TRX, Pilates, plyometrics, rehab and seniors, pregnancy and postnatal, and pelvic floor and deep core. The lists live in `packages/db/seed/exercises*.ts`. About 220 of them come with start and finish photos from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain), each matched and checked by hand; clients tap the photo on the workout screen to see them larger with the form cue. See "Exercise photos" in CLAUDE.md before adding more. Running it again also adds search words to exercises that don't have any yet. Create your account first. It is safe to run again: anything that already exists by name is skipped and nothing you've edited is changed. Use `bun run db:seed:remote` for the live database. Edit the lists in `packages/db/seed/`. It adds no programs: build those in the admin. Use `bun run db:seed:dev` for the Cloudflare dev database.

## Exercise photos and videos

About 220 exercises come with stock photos (public domain). For the rest, open an exercise in the admin and use **Add photos** (a start and an optional finish photo, shrunk before upload) and/or paste a **Video link**. Clients tap the photo on the workout screen to see the photos, the video button and the form cue.

Uploads are stored in Cloudflare R2. Locally this just works. Before the first deploy, create the buckets once:

```bash
bunx wrangler r2 bucket create project180-media-dev
bunx wrangler r2 bucket create project180-media
```

### How-to videos (YouTube search inside the app)

Clients can tap **Show how-to videos** on any exercise and watch YouTube results inside the app; coaches pick a video for an exercise in the admin (it then plays first, marked as the coach's). Searching needs a free YouTube Data API key; without one, the app just opens YouTube.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, enable **YouTube Data API v3**, and create an **API key** (restrict it to that API).
2. Add it as a secret to both apps (and `--env dev` for the dev site): `bunx wrangler secret put YOUTUBE_API_KEY`. Locally, put `YOUTUBE_API_KEY=…` in `apps/app/.dev.vars`.

Results are cached per exercise for 30 days and shared by everyone, so the free quota (about 100 searches a day) is plenty.

## Cloudflare dev environment

A full copy of the app on Cloudflare for testing, with its own Workers and its own database, so nothing you try there touches real data:

|           | Dev                                                         | Live                                                |
| --------- | ----------------------------------------------------------- | --------------------------------------------------- |
| Phone app | `project180-app-dev` → https://dev.project180.co.za         | `project180-app` → https://project180.co.za         |
| Admin     | `project180-admin-dev` → https://admin-dev.project180.co.za | `project180-admin` → https://admin.project180.co.za |
| Database  | `project180-db-dev`                                         | `project180-db`                                     |

The addresses are Cloudflare custom domains (`routes` in `apps/*/wrangler.jsonc`): `project180.co.za` must be a zone in the same Cloudflare account (its nameservers pointed at Cloudflare). Wrangler creates the DNS records and certificates on deploy, and stops if a record with the same name already exists, so delete any old `dev`, `admin-dev` (or, for live, root and `admin`) records first. Each address is set in three places: `routes`, `vars.BETTER_AUTH_URL` and the other app's `.env.dev` / `.env.production`.

**One-time setup**

```bash
bunx wrangler login                                   # opens the browser; sign in to Cloudflare
cd apps/app
bunx wrangler d1 create project180-db-dev             # paste the database_id into env.dev in BOTH apps' wrangler.jsonc
cd ../..
bun run db:migrate:dev                                # creates the tables
openssl rand -base64 32                               # copy this secret
cd apps/app   && bunx wrangler secret put BETTER_AUTH_SECRET --env dev   # paste it
cd ../admin   && bunx wrangler secret put BETTER_AUTH_SECRET --env dev   # paste the same one
cd ../..
```

**Deploy** (every time):

```bash
bun run deploy:dev        # builds both apps with --mode dev and deploys both Workers
```

**First use:** `bun run admin:create:dev` to create the admins, then `bun run db:seed:dev` to add the starter library. Sign in at https://admin-dev.project180.co.za and add everyone else under Users. After schema changes, run `bun run db:migrate:dev` before deploying.

How it works: `vite build --mode dev` loads `apps/*/.env.dev`, whose `CLOUDFLARE_ENV=dev` makes the Cloudflare Vite plugin build the `env.dev` section of `wrangler.jsonc` (its Worker name, database and vars). `wrangler deploy` then ships exactly that build, so it needs no `--env`. The commands that talk to Cloudflare directly (`d1 create`, `migrations apply`, `secret put`) do take `--env dev`.

## Deploying to Cloudflare

Two Workers, `project180-app` and `project180-admin`, both bound to the same D1 database.

```bash
cd apps/app
bunx wrangler login
bunx wrangler d1 create project180-db       # paste the id into BOTH apps' wrangler.jsonc
bun run db:migrate:remote
bunx wrangler secret put BETTER_AUTH_SECRET                    # a long random string
cd ../admin && bunx wrangler secret put BETTER_AUTH_SECRET     # the same string
```

The live addresses (project180.co.za and admin.project180.co.za) are already set in `wrangler.jsonc` and `.env.production`. Finally: `bun run build && bun run deploy` from the root.

The Workers Paid plan ($5/month) is recommended: password hashing can exceed the free plan's CPU limit per request.

## Layout

```
apps/app            Phone PWA (port 5173): today, calendar, workouts, progress, profile
apps/admin          Admin dashboard (port 5174): exercises, workouts, programs, users
  */worker/index.ts each app's Worker mounts the shared API at /api
packages/api        Hono API + Better Auth (tests run in the Workers runtime)
packages/client     Browser helpers both apps share: API calls, auth client, queries, theme
packages/db         Drizzle schema for all 13 tables, migrations in drizzle/
packages/shared     Enums, Zod validators, calendar and stats logic (+ tests)
packages/ui         Design tokens (light/dark) and components
packages/config     Shared TypeScript config
```

## Conventions

- Auto-increment integer ids. Sessions, sets and check-ins also carry a `client_uuid` for offline sync.
- Every query on personal data filters by the signed-in user; private items answer 404 to others.
- Library rows are archived, never deleted.
- Colours, type and spacing come from `packages/ui/src/tokens.css`, which mirrors the Project 180 design system.
