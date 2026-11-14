// Philip's own 4-week plan: hybrid (weights first, some running), with a lot of hip and
// shoulder mobility. Exercise names must match the seed exercise lists.
// Added with `bun run db:philip` (local) or `bun run db:philip:dev` (Cloudflare dev).

type Section = 'warm_up' | 'main' | 'cool_down'

export interface PlanRow {
  name: string
  section: Section
  sets: number
  repsMin: number | null
  repsMax: number | null
  seconds: number | null
  rest: number
  /** Same number = done together as a superset. */
  group: number | null
  hrZone: number | null
  notes: string | null
}

export interface PlanWorkout {
  name: string
  description: string
  minutes: number
  /** Rounds for each superset group number used in `rows`. */
  supersets: Record<number, number>
  rows: PlanRow[]
}

interface Extra {
  rest?: number
  group?: number
  hrZone?: number
  notes?: string
}

const row = (
  section: Section,
  name: string,
  sets: number,
  reps: [number, number] | null,
  seconds: number | null,
  defaultRest: number,
  extra: Extra,
): PlanRow => ({
  name,
  section,
  sets,
  repsMin: reps ? reps[0] : null,
  repsMax: reps ? reps[1] : null,
  seconds,
  rest: extra.rest ?? defaultRest,
  group: extra.group ?? null,
  hrZone: extra.hrZone ?? null,
  notes: extra.notes ?? null,
})

/** Warm-up drill for reps. */
const prep = (name: string, sets: number, reps: number, extra: Extra = {}) =>
  row('warm_up', name, sets, [reps, reps], null, 15, extra)
/** Warm-up cardio or a timed drill. */
const prepTime = (name: string, sets: number, seconds: number, extra: Extra = {}) =>
  row('warm_up', name, sets, null, seconds, 15, extra)
/** Main lift: sets x a rep range. */
const lift = (name: string, sets: number, min: number, max: number, extra: Extra = {}) =>
  row('main', name, sets, [min, max], null, 90, extra)
/** Timed work in the main part: holds and the cardio finisher. */
const timed = (name: string, sets: number, seconds: number, extra: Extra = {}) =>
  row('main', name, sets, null, seconds, 45, extra)
/** Cool-down stretch held for time. Two sets = one per side. */
const hold = (name: string, sets: number, seconds: number, extra: Extra = {}) =>
  row('cool_down', name, sets, null, seconds, 10, extra)
/** Cool-down drill for reps. */
const ease = (name: string, sets: number, reps: number, extra: Extra = {}) =>
  row('cool_down', name, sets, [reps, reps], null, 10, extra)

const SIDES = 'One set per side.'
const EASY = 'Easy pace: you can still talk. Swap for any machine if you prefer.'

export const PHILIP_WORKOUTS: PlanWorkout[] = [
  {
    name: 'Philip · Lower A (Squat & Calves)',
    description:
      'Hips open first, then squat. Quads, hamstrings and calves, a 10-minute cardio finisher and the hip stretches.',
    minutes: 80,
    supersets: { 1: 3 },
    rows: [
      prepTime('Treadmill Incline Walk', 1, 300, { notes: '5 minutes, brisk. Just get warm.' }),
      prep('Cat-Cow', 1, 10, { notes: 'Slow. Move the lower back gently, no forcing.' }),
      prep('Hip 90/90 Switch', 2, 8, { notes: 'Reps per side. Sit tall, hands off if you can.' }),
      prep("World's Greatest Stretch", 1, 5, { notes: 'Reps per side.' }),
      prep('Ankle Rocks (Knee to Wall)', 1, 10, { notes: 'Reps per side. Heel stays down.' }),
      prepTime('Deep Squat Pry', 2, 45, { notes: 'Elbows push the knees out, chest tall.' }),
      prep('Glute Bridge Warm-Up', 2, 12, { notes: 'Squeeze 2 seconds at the top.' }),
      lift('Barbell Back Squat', 4, 8, 10, {
        rest: 150,
        notes:
          '2 lighter ramp-up sets first. 3 seconds down, as deep as the hips allow with a flat back.',
      }),
      lift('Bulgarian Split Squat', 3, 10, 12, {
        notes: 'Per leg. Long stride, feel the back hip stretch at the bottom.',
      }),
      lift('Leg Press', 3, 12, 15, { notes: 'Full depth, lower back stays on the pad.' }),
      lift('Seated Leg Curl', 3, 10, 12, { rest: 75 }),
      lift('Standing Calf Raise', 4, 10, 12, {
        rest: 60,
        notes: 'Pause 2 seconds in the stretch and 1 second at the top. No bouncing.',
      }),
      lift('Face Pull', 3, 15, 15, {
        rest: 0,
        group: 1,
        notes: 'Pull to the eyes, thumbs back, hold 1 second.',
      }),
      lift('Dead Bug', 3, 10, 10, {
        rest: 60,
        group: 1,
        notes: 'Reps per side. Lower back stays pressed into the floor.',
      }),
      timed('Treadmill Run', 1, 600, { rest: 0, hrZone: 2, notes: EASY }),
      hold('Pigeon Stretch', 2, 90, { notes: SIDES }),
      hold('Couch Stretch', 2, 60, { notes: `${SIDES} Squeeze the glute of the back leg.` }),
      hold('Figure-Four Stretch', 2, 60, { notes: SIDES }),
      hold('Frog Stretch', 1, 90, { notes: 'Rock gently back and forward.' }),
      hold('Calf Stretch', 2, 45, { notes: SIDES }),
      hold("Child's Pose", 1, 60, { notes: 'Breathe into the lower back.' }),
    ],
  },
  {
    name: 'Philip · Upper A (Pull & Posture)',
    description:
      'More pulling than pushing to bring the shoulders back. Rear delts twice, a short calf block, cardio and stretches.',
    minutes: 75,
    supersets: { 1: 4, 2: 3 },
    rows: [
      prepTime('Rowing Machine', 1, 300, { notes: '5 minutes easy. Sit tall, chest proud.' }),
      prepTime('Foam Roll Upper Back', 1, 60, { notes: 'Arms crossed, small rolls, breathe out.' }),
      prep('Thoracic Spine Rotation (Open Book)', 1, 8, { notes: 'Reps per side.' }),
      prep('Wall Slide', 2, 10, { notes: 'Ribs down, forearms stay on the wall.' }),
      prep('Band Pull-Apart', 2, 15, { notes: 'Squeeze the shoulder blades, no shrugging.' }),
      prep('Scapular Push-Up', 1, 10),
      lift('Chest-Supported Row', 4, 8, 10, {
        rest: 120,
        notes: 'Chest on the pad (easy on the lower back). Pause 1 second at the top.',
      }),
      lift('Incline Dumbbell Press', 4, 8, 10, {
        rest: 120,
        notes: 'Shoulder blades back and down the whole set.',
      }),
      lift('Lat Pulldown', 3, 10, 12, { notes: 'Full stretch at the top, elbows to the hips.' }),
      lift('Reverse Pec Deck', 4, 12, 15, {
        rest: 0,
        group: 1,
        notes: 'Rear delts. Lead with the elbows, light and strict.',
      }),
      lift('Cable Lateral Raise', 4, 12, 15, { rest: 60, group: 1, notes: 'Per arm.' }),
      lift('Face Pull', 3, 15, 20, { rest: 60, notes: 'Pull high and apart, hold 1 second.' }),
      lift('Incline Dumbbell Curl', 3, 10, 12, { rest: 0, group: 2 }),
      lift('Tricep Rope Pushdown', 3, 10, 12, { rest: 60, group: 2 }),
      lift('Single-Leg Calf Raise', 3, 12, 15, {
        rest: 45,
        notes: 'Per leg, off a step. Slow down, full stretch. Hold a dumbbell when 15 is easy.',
      }),
      timed('Treadmill Incline Walk', 1, 600, { rest: 0, hrZone: 2, notes: EASY }),
      hold('Chest Doorway Stretch', 2, 45, { notes: SIDES }),
      hold('Lat Stretch (Wall)', 2, 45, { notes: SIDES }),
      hold('Cross-Body Shoulder Stretch', 2, 30, { notes: SIDES }),
      hold('Puppy Pose', 1, 60, { notes: 'Chest sinks to the floor, arms long.' }),
      hold('Half Pigeon', 2, 90, { notes: `${SIDES} Your daily hip opener.` }),
      hold('Hip Flexor Stretch', 2, 45, { notes: SIDES }),
    ],
  },
  {
    name: 'Philip · Run & Hip Reset',
    description:
      'Easy run (road or treadmill), a little core for the lower back, then the long mobility session for hips and shoulders.',
    minutes: 60,
    supersets: {},
    rows: [
      prep('Leg Swings', 1, 10, { notes: 'Reps per leg, front to back.' }),
      prep('Lateral Leg Swing', 1, 10, { notes: 'Reps per leg, side to side.' }),
      prep('Walking Knee Hug', 1, 10),
      prepTime('Dynamic Running Drills', 1, 120, { notes: 'High knees, butt kicks, skips.' }),
      timed('Easy Run', 1, 1500, {
        rest: 60,
        hrZone: 2,
        notes:
          '25 minutes where you can still talk. No run today? 30 minutes incline walk on the treadmill.',
      }),
      lift('Bird Dog', 3, 8, 8, { rest: 30, notes: 'Reps per side. Hold each one 3 seconds.' }),
      timed('Side Plank', 2, 30, { rest: 20, notes: SIDES }),
      lift('McGill Curl-Up', 3, 8, 8, { rest: 30, notes: 'Small lift, hold 5 seconds each.' }),
      hold('Pigeon Stretch', 2, 120, { notes: `${SIDES} Relax into it, slow breaths.` }),
      hold('90/90 Hip Stretch', 2, 90, { notes: SIDES }),
      hold('Couch Stretch', 2, 90, { notes: SIDES }),
      hold('Lizard Pose', 2, 60, { notes: SIDES }),
      hold('Butterfly Stretch', 1, 90),
      hold('Garland Pose (Malasana)', 2, 45, { notes: 'Deep squat hold. Hold onto something.' }),
      ease('Thread the Needle', 1, 8, { notes: 'Reps per side.' }),
      ease('Wall Angels', 2, 10, { notes: 'Back, head and arms on the wall.' }),
      hold('Chest Doorway Stretch', 2, 45, { notes: SIDES }),
      hold('Supine Spinal Twist', 2, 45, { notes: SIDES }),
      hold('Calf Stretch', 2, 45, { notes: SIDES }),
    ],
  },
  {
    name: 'Philip · Lower B (Glutes, Hinge & Calves)',
    description:
      'Glutes and hamstrings with a flat back, paused squats for depth, seated calves, cardio and the hip stretches.',
    minutes: 80,
    supersets: { 1: 3 },
    rows: [
      prepTime('Stationary Bike', 1, 300, { notes: '5 minutes, light resistance.' }),
      prep('Cat-Cow', 1, 10),
      prep('Half-Kneeling Hip Flexor Rock', 1, 10, { notes: 'Reps per side.' }),
      prep('Adductor Rock-Back', 1, 10, { notes: 'Reps per side.' }),
      prep('Shin Box Get-Up', 2, 6, { notes: 'Reps per side. Drive the hips through.' }),
      prep('Banded Lateral Walk', 2, 12, { notes: 'Steps each way. Toes forward, knees out.' }),
      prep('Bird Dog', 1, 8, { notes: 'Reps per side.' }),
      lift('Barbell Hip Thrust', 4, 8, 10, {
        rest: 120,
        notes: 'Chin tucked, ribs down, hold the top 2 seconds.',
      }),
      lift('Romanian Deadlift', 3, 8, 10, {
        rest: 120,
        notes:
          'Flat back, push the hips back, stop where the hamstrings stop you. Start light: no back pain.',
      }),
      lift('Goblet Squat', 3, 10, 12, {
        notes: 'Squat practice: pause 2 seconds at the bottom, elbows inside the knees.',
      }),
      lift('Walking Lunge', 3, 10, 12, { notes: 'Per leg. Long steps, upright.' }),
      lift('Back Extension', 3, 12, 15, {
        rest: 60,
        notes: 'Glutes do the work. Stop in a straight line, no arching.',
      }),
      lift('Seated Calf Raise', 4, 12, 15, {
        rest: 60,
        notes: 'Pause 2 seconds in the stretch. Slow.',
      }),
      lift('Rear Delt Fly', 3, 15, 15, {
        rest: 0,
        group: 1,
        notes: 'Light, lead with the elbows.',
      }),
      lift('Pallof Press', 3, 10, 10, { rest: 60, group: 1, notes: 'Reps per side.' }),
      timed('Stair Climber', 1, 600, { rest: 0, hrZone: 2, notes: EASY }),
      hold('Pigeon Stretch', 2, 90, { notes: SIDES }),
      hold('Figure-Four Stretch', 2, 60, { notes: SIDES }),
      hold('Hamstring Stretch', 2, 45, { notes: SIDES }),
      hold('Couch Stretch', 2, 60, { notes: SIDES }),
      hold('Knees-to-Chest', 1, 60, { notes: 'Let the lower back relax.' }),
      hold('Standing Calf Stretch (Bent Knee)', 2, 45, { notes: SIDES }),
    ],
  },
  {
    name: 'Philip · Upper B (Shoulders, Rear Delts & Arms)',
    description:
      'Shoulders and back, two rear-delt exercises, arms, a short calf block, cardio and stretches.',
    minutes: 75,
    supersets: { 1: 4, 2: 3 },
    rows: [
      prepTime('Elliptical', 1, 300, { notes: '5 minutes, use the arms.' }),
      prep('Quadruped Thoracic Rotation', 1, 8, { notes: 'Reps per side.' }),
      prep('Wall Angels', 2, 10, { notes: 'Back, head and arms on the wall.' }),
      prep('Shoulder Dislocate (Band)', 1, 12, { notes: 'Wide grip, slow.' }),
      prep('Band External Rotation', 2, 12, { notes: 'Reps per arm. Elbow stays at your side.' }),
      lift('Seated Dumbbell Shoulder Press', 4, 8, 10, {
        rest: 120,
        notes: 'Back on the pad, no arching the lower back.',
      }),
      lift('Seated Cable Row', 4, 10, 12, {
        rest: 105,
        notes: 'Sit tall, pull to the belly button, pause 1 second.',
      }),
      lift('Machine Chest Press', 3, 10, 12),
      lift('Neutral-Grip Pull-Up', 3, 6, 10, {
        rest: 120,
        notes: 'Full hang at the bottom. Use the assisted machine if under 6.',
      }),
      lift('Cable Rear Delt Fly', 4, 12, 15, { rest: 0, group: 1, notes: 'Arms wide, no shrug.' }),
      lift('Dumbbell Lateral Raise', 4, 12, 15, { rest: 60, group: 1 }),
      lift('Bent-Over Rear Delt Raise (Incline Bench)', 3, 12, 15, {
        rest: 60,
        notes: 'Chest on the bench. Pause 1 second at the top.',
      }),
      lift('Hammer Curl', 3, 10, 12, { rest: 0, group: 2 }),
      lift('Overhead Cable Tricep Extension', 3, 10, 12, { rest: 60, group: 2 }),
      lift('Smith Machine Calf Raise', 3, 12, 15, {
        rest: 60,
        notes: 'Front of the feet on a plate. Full stretch, pause, full squeeze.',
      }),
      timed('Rowing Machine', 1, 600, { rest: 0, hrZone: 2, notes: EASY }),
      hold('Pec Stretch (Floor)', 2, 45, { notes: SIDES }),
      hold('Lat Stretch (Bar Hang)', 2, 30, { notes: 'Just hang and breathe.' }),
      hold('Upper Trap Stretch', 2, 30, { notes: SIDES }),
      ease('Thread the Needle', 1, 8, { notes: 'Reps per side.' }),
      hold('Pigeon Stretch', 2, 90, { notes: SIDES }),
      hold('90/90 Hip Stretch', 2, 60, { notes: SIDES }),
    ],
  },
]

const [LOWER_A, UPPER_A, RUN, LOWER_B, UPPER_B] = PHILIP_WORKOUTS.map((w) => w.name) as [
  string,
  string,
  string,
  string,
  string,
]

/** How hard to push each week (shown on every training day of that week). */
const WEEK_NOTES = [
  'Week 1: find your weights. Stop every set with about 3 reps left.',
  'Week 2: same weights, one or two more reps per set. About 2 reps left.',
  'Week 3: add weight (2.5–5 kg on legs, the smallest jump on upper body). 1–2 reps left.',
  'Week 4: best week. Top of the rep range at week 3 weights, last set of the first lift close to failure.',
]

/** Day 1 is the start date (a Monday works best). Days 4 and 7 are rest days. */
const WEEK: Array<{ day: number; workout: string }> = [
  { day: 1, workout: LOWER_A },
  { day: 2, workout: UPPER_A },
  { day: 3, workout: RUN },
  { day: 5, workout: LOWER_B },
  { day: 6, workout: UPPER_B },
]

export const PHILIP_PROGRAM = {
  name: "Philip's Workout",
  description:
    'Four weeks, five days a week: two lower, two upper and a run with a long mobility session. Every day starts with a warm-up and ends with cardio and stretches for stiff hips, glutes and rounded shoulders. Extra work for calves and rear delts.',
  durationWeeks: 4,
  days: WEEK_NOTES.flatMap((note, i) =>
    WEEK.map((d) => ({
      weekNumber: i + 1,
      dayNumber: d.day,
      workout: d.workout,
      // Weigh in on the first morning of each week.
      checkinRequired: d.day === 1,
      notes: note,
    })),
  ),
}
