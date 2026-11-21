// Ready-made programs for people training on their own: the starter library's programs.
// Generic, gym-based, and easy to follow without a coach. Exercise names must match the seed
// exercise lists (the script checks). Added with `bun run db:starter` (see the script).

type Section = 'warm_up' | 'main' | 'cool_down'

export interface StarterRow {
  name: string
  section: Section
  sets: number
  repsMin: number | null
  repsMax: number | null
  seconds: number | null
  rest: number
  /** How hard the last set should feel, 1–10. */
  rpe: number | null
  hrZone: number | null
  notes: string | null
}

export interface StarterWorkout {
  name: string
  description: string
  minutes: number
  rows: StarterRow[]
}

export interface StarterProgram {
  name: string
  description: string
  durationWeeks: number
  /** One week: day number (1 = their start day) → workout name. Repeats every week. */
  week: Array<{ day: number; workout: string }>
  /** A line for each week (progression), shown on that week's days. */
  weekNotes: string[]
}

interface Extra {
  rest?: number
  rpe?: number
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
): StarterRow => ({
  name,
  section,
  sets,
  repsMin: reps ? reps[0] : null,
  repsMax: reps ? reps[1] : null,
  seconds,
  rest: extra.rest ?? defaultRest,
  rpe: extra.rpe ?? null,
  hrZone: extra.hrZone ?? null,
  notes: extra.notes ?? null,
})

const warm = (name: string, sets: number, reps: number, extra: Extra = {}) =>
  row('warm_up', name, sets, [reps, reps], null, 15, extra)
const warmTime = (name: string, seconds: number, extra: Extra = {}) =>
  row('warm_up', name, 1, null, seconds, 15, extra)
const lift = (name: string, sets: number, min: number, max: number, extra: Extra = {}) =>
  row('main', name, sets, [min, max], null, 90, extra)
const timed = (name: string, sets: number, seconds: number, extra: Extra = {}) =>
  row('main', name, sets, null, seconds, 60, extra)
const stretch = (name: string, sets: number, seconds: number, extra: Extra = {}) =>
  row('cool_down', name, sets, null, seconds, 10, extra)

const SIDES = 'One set per side.'
const BIG = 'Two lighter warm-up sets first. Stop each set with 1–2 good reps left.'

// ── Shared warm-ups and cool-downs ────────────────────────────────────────
const upperWarmUp = [
  warmTime('Rowing Machine', 300, { notes: '5 minutes easy, just get warm.' }),
  warmTime('Arm Circles', 45),
  warm('Band Pull-Apart', 2, 15, { notes: 'Squeeze the shoulder blades together.' }),
]
const lowerWarmUp = [
  warmTime('Stationary Bike', 300, { notes: '5 minutes easy, just get warm.' }),
  warm('Leg Swings', 1, 10, { notes: 'Each leg, front to back and side to side.' }),
  warm("World's Greatest Stretch", 1, 5, { notes: 'Reps per side.' }),
  warm('Glute Bridge Warm-Up', 2, 12),
]
const upperCoolDown = [
  stretch('Pec Stretch (Floor)', 2, 30, { notes: SIDES }),
  stretch('Lat Stretch (Wall)', 1, 45),
  stretch('Cross-Body Shoulder Stretch', 2, 30, { notes: SIDES }),
]
const lowerCoolDown = [
  stretch('Hamstring Stretch', 2, 45, { notes: SIDES }),
  stretch('Hip Flexor Stretch', 2, 45, { notes: SIDES }),
  stretch('Quad Stretch', 2, 30, { notes: SIDES }),
]

export const STARTER_WORKOUTS: StarterWorkout[] = [
  // ── Push Pull Legs ──────────────────────────────────────────────────────
  {
    name: 'PPL · Push A',
    description: 'Chest, shoulders and triceps. Bench press first while you’re fresh.',
    minutes: 60,
    rows: [
      ...upperWarmUp,
      lift('Barbell Bench Press', 4, 6, 8, { rest: 150, rpe: 8, notes: BIG }),
      lift('Seated Dumbbell Shoulder Press', 3, 8, 10, { rest: 120, rpe: 8 }),
      lift('Incline Dumbbell Press', 3, 10, 12, { rpe: 8 }),
      lift('Dumbbell Lateral Raise', 3, 12, 15, { rest: 60, rpe: 9 }),
      lift('Tricep Rope Pushdown', 3, 10, 12, { rest: 60, rpe: 9 }),
      ...upperCoolDown,
    ],
  },
  {
    name: 'PPL · Pull A',
    description: 'Back and biceps, with rear delts for good posture.',
    minutes: 60,
    rows: [
      ...upperWarmUp,
      lift('Lat Pulldown', 4, 8, 10, { rest: 120, rpe: 8, notes: 'Pull to the top of the chest.' }),
      lift('Barbell Row', 3, 8, 10, { rest: 120, rpe: 8, notes: 'Flat back, pull to the belly.' }),
      lift('Seated Cable Row', 3, 10, 12, { rpe: 8 }),
      lift('Face Pull', 3, 15, 15, { rest: 60, rpe: 8, notes: 'Pull to the eyes, thumbs back.' }),
      lift('Dumbbell Curl', 3, 10, 12, { rest: 60, rpe: 9 }),
      ...upperCoolDown,
    ],
  },
  {
    name: 'PPL · Legs A',
    description: 'Squat-focused legs: quads, hamstrings, glutes and calves.',
    minutes: 65,
    rows: [
      ...lowerWarmUp,
      lift('Barbell Back Squat', 4, 6, 8, { rest: 150, rpe: 8, notes: BIG }),
      lift('Romanian Deadlift', 3, 8, 10, { rest: 120, rpe: 8, notes: 'Hips back, soft knees.' }),
      lift('Leg Press', 3, 10, 12, { rpe: 8 }),
      lift('Seated Leg Curl', 3, 10, 12, { rest: 75, rpe: 9 }),
      lift('Standing Calf Raise', 3, 12, 15, { rest: 60, rpe: 9, notes: 'Pause at the bottom.' }),
      ...lowerCoolDown,
    ],
  },
  {
    name: 'PPL · Push B',
    description: 'Overhead press first, then more chest and triceps volume.',
    minutes: 60,
    rows: [
      ...upperWarmUp,
      lift('Overhead Press', 4, 6, 8, { rest: 150, rpe: 8, notes: BIG }),
      lift('Incline Barbell Bench Press', 3, 8, 10, { rest: 120, rpe: 8 }),
      lift('Cable Fly', 3, 12, 15, { rest: 60, rpe: 9 }),
      lift('Cable Lateral Raise', 3, 12, 15, { rest: 60, rpe: 9 }),
      lift('EZ-Bar Skull Crusher', 3, 10, 12, { rest: 60, rpe: 9 }),
      ...upperCoolDown,
    ],
  },
  {
    name: 'PPL · Pull B',
    description: 'Deadlift day: back thickness, then width and arms.',
    minutes: 65,
    rows: [
      ...upperWarmUp,
      lift('Conventional Deadlift', 3, 5, 6, { rest: 180, rpe: 8, notes: BIG }),
      lift('Pull-Up', 3, 6, 10, {
        rest: 120,
        rpe: 8,
        notes: 'Use the assisted machine if needed.',
      }),
      lift('Chest-Supported Row', 3, 10, 12, { rpe: 8 }),
      lift('Rear Delt Fly', 3, 12, 15, { rest: 60, rpe: 9 }),
      lift('Hammer Curl', 3, 10, 12, { rest: 60, rpe: 9 }),
      ...upperCoolDown,
    ],
  },
  {
    name: 'PPL · Legs B',
    description: 'Glutes and hamstrings first, single-leg work and core.',
    minutes: 60,
    rows: [
      ...lowerWarmUp,
      lift('Barbell Hip Thrust', 4, 8, 10, {
        rest: 120,
        rpe: 8,
        notes: 'Pause 1 second at the top.',
      }),
      lift('Bulgarian Split Squat', 3, 8, 10, { rpe: 8, notes: 'Per leg.' }),
      lift('Leg Extension', 3, 12, 15, { rest: 60, rpe: 9 }),
      lift('Lying Leg Curl', 3, 10, 12, { rest: 60, rpe: 9 }),
      lift('Hanging Knee Raise', 3, 10, 15, { rest: 60 }),
      ...lowerCoolDown,
    ],
  },

  // ── Upper / Lower ───────────────────────────────────────────────────────
  {
    name: 'Upper A (Strength)',
    description: 'Heavier upper day: bench, rows and presses.',
    minutes: 60,
    rows: [
      ...upperWarmUp,
      lift('Barbell Bench Press', 4, 5, 6, { rest: 180, rpe: 8, notes: BIG }),
      lift('Barbell Row', 4, 6, 8, { rest: 150, rpe: 8 }),
      lift('Seated Dumbbell Shoulder Press', 3, 8, 10, { rest: 120, rpe: 8 }),
      lift('Lat Pulldown', 3, 8, 10, { rpe: 8 }),
      lift('Tricep Rope Pushdown', 2, 10, 12, { rest: 60, rpe: 9 }),
      lift('Dumbbell Curl', 2, 10, 12, { rest: 60, rpe: 9 }),
      ...upperCoolDown,
    ],
  },
  {
    name: 'Lower A (Strength)',
    description: 'Heavier lower day: squat and Romanian deadlift.',
    minutes: 60,
    rows: [
      ...lowerWarmUp,
      lift('Barbell Back Squat', 4, 5, 6, { rest: 180, rpe: 8, notes: BIG }),
      lift('Romanian Deadlift', 3, 6, 8, { rest: 150, rpe: 8 }),
      lift('Walking Lunge', 3, 10, 12, { rpe: 8, notes: 'Steps per leg.' }),
      lift('Standing Calf Raise', 3, 10, 12, { rest: 60, rpe: 9 }),
      timed('Plank', 3, 45, { rest: 45 }),
      ...lowerCoolDown,
    ],
  },
  {
    name: 'Upper B (Volume)',
    description: 'Lighter upper day with more reps: incline, pull-ups and arms.',
    minutes: 60,
    rows: [
      ...upperWarmUp,
      lift('Incline Dumbbell Press', 4, 8, 12, { rest: 120, rpe: 8 }),
      lift('Pull-Up', 4, 6, 10, {
        rest: 120,
        rpe: 8,
        notes: 'Use the assisted machine if needed.',
      }),
      lift('Machine Chest Press', 3, 10, 12, { rpe: 9 }),
      lift('Seated Cable Row', 3, 10, 12, { rpe: 9 }),
      lift('Dumbbell Lateral Raise', 3, 12, 15, { rest: 60, rpe: 9 }),
      lift('Face Pull', 3, 15, 15, { rest: 60, rpe: 8 }),
      ...upperCoolDown,
    ],
  },
  {
    name: 'Lower B (Volume)',
    description: 'Lighter lower day: deadlift, leg press, glutes and hamstrings.',
    minutes: 60,
    rows: [
      ...lowerWarmUp,
      lift('Conventional Deadlift', 3, 5, 6, { rest: 180, rpe: 7, notes: BIG }),
      lift('Leg Press', 3, 10, 15, { rpe: 9 }),
      lift('Barbell Hip Thrust', 3, 10, 12, { rpe: 8 }),
      lift('Seated Leg Curl', 3, 12, 15, { rest: 60, rpe: 9 }),
      lift('Seated Calf Raise', 3, 12, 15, { rest: 60, rpe: 9 }),
      ...lowerCoolDown,
    ],
  },

  // ── Full body for beginners ─────────────────────────────────────────────
  {
    name: 'Beginner · Full Body A',
    description:
      'Learn the main movements with machines and dumbbells. Leave a few reps in the tank.',
    minutes: 50,
    rows: [
      warmTime('Treadmill Incline Walk', 300, { notes: '5 minutes, brisk.' }),
      warm('Glute Bridge Warm-Up', 1, 12),
      warm('Band Pull-Apart', 1, 15),
      lift('Goblet Squat', 3, 10, 12, { rpe: 7, notes: 'Chest tall, sit between the heels.' }),
      lift('Machine Chest Press', 3, 10, 12, { rpe: 7 }),
      lift('Lat Pulldown', 3, 10, 12, { rpe: 7 }),
      lift('Seated Leg Curl', 2, 10, 12, { rest: 75, rpe: 7 }),
      lift('Dumbbell Lateral Raise', 2, 12, 15, { rest: 60, rpe: 7 }),
      timed('Plank', 2, 30, { rest: 45 }),
      stretch('Hamstring Stretch', 2, 30, { notes: SIDES }),
      stretch("Child's Pose", 1, 45),
    ],
  },
  {
    name: 'Beginner · Full Body B',
    description: 'Hinge, push and pull with simple, safe exercises.',
    minutes: 50,
    rows: [
      warmTime('Stationary Bike', 300, { notes: '5 minutes easy.' }),
      warm('Cat-Cow', 1, 10),
      warm('Leg Swings', 1, 10, { notes: 'Each leg.' }),
      lift('Leg Press', 3, 10, 12, { rpe: 7 }),
      lift('Romanian Deadlift', 3, 10, 12, { rpe: 7, notes: 'Light dumbbells, hips back.' }),
      lift('Dumbbell Bench Press', 3, 10, 12, { rpe: 7 }),
      lift('Seated Cable Row', 3, 10, 12, { rpe: 7 }),
      lift('Dumbbell Curl', 2, 10, 12, { rest: 60, rpe: 7 }),
      lift('Dead Bug', 2, 8, 10, { rest: 45, notes: 'Reps per side, lower back flat.' }),
      stretch('Hip Flexor Stretch', 2, 30, { notes: SIDES }),
      stretch('Pec Stretch (Floor)', 2, 30, { notes: SIDES }),
    ],
  },

  // ── Fat loss: strength + conditioning ───────────────────────────────────
  {
    name: 'Fat Loss · Strength A',
    description: 'Full-body strength to keep your muscle while you lose fat.',
    minutes: 55,
    rows: [
      ...lowerWarmUp,
      lift('Barbell Back Squat', 3, 8, 10, { rest: 120, rpe: 8, notes: BIG }),
      lift('Dumbbell Bench Press', 3, 8, 10, { rest: 90, rpe: 8 }),
      lift('Lat Pulldown', 3, 10, 12, { rest: 75, rpe: 8 }),
      lift('Walking Lunge', 2, 10, 12, { rest: 75, rpe: 8, notes: 'Steps per leg.' }),
      timed("Farmer's Carry", 3, 40, { rest: 60, notes: 'Heavy, tall posture.' }),
      ...lowerCoolDown,
    ],
  },
  {
    name: 'Fat Loss · Intervals',
    description: 'Short, hard intervals on the bike or rower, then core.',
    minutes: 35,
    rows: [
      warmTime('Stationary Bike', 300, { notes: '5 minutes easy, build up slowly.' }),
      timed('Bike Intervals', 8, 30, {
        rest: 90,
        hrZone: 4,
        rpe: 8,
        notes: '30 seconds hard, 90 seconds easy spinning.',
      }),
      timed('Mountain Climber', 3, 30, { rest: 30 }),
      lift('Dead Bug', 3, 10, 10, { rest: 30, notes: 'Reps per side.' }),
      stretch('Hip Flexor Stretch', 2, 30, { notes: SIDES }),
      stretch("Child's Pose", 1, 60),
    ],
  },
  {
    name: 'Fat Loss · Strength B',
    description: 'Hinge, press and row, with a short finisher.',
    minutes: 55,
    rows: [
      ...upperWarmUp,
      lift('Romanian Deadlift', 3, 8, 10, { rest: 120, rpe: 8 }),
      lift('Seated Dumbbell Shoulder Press', 3, 8, 10, { rest: 90, rpe: 8 }),
      lift('Dumbbell Row', 3, 10, 12, { rest: 75, rpe: 8, notes: 'Per arm.' }),
      lift('Goblet Squat', 3, 12, 15, { rest: 75, rpe: 8 }),
      lift('Kettlebell Swing', 3, 15, 15, {
        rest: 60,
        rpe: 8,
        notes: 'Snap the hips, arms relaxed.',
      }),
      ...upperCoolDown,
    ],
  },
  {
    name: 'Fat Loss · Zone 2 Cardio',
    description: 'Long, easy cardio: you can still talk the whole time. Walk, cycle or row.',
    minutes: 45,
    rows: [
      timed('Treadmill Incline Walk', 1, 2400, {
        rest: 0,
        hrZone: 2,
        rpe: 4,
        notes: '40 minutes at a steady, easy pace. Any cardio machine or a walk outside is fine.',
      }),
      stretch('Calf Stretch', 2, 30, { notes: SIDES }),
      stretch('Hamstring Stretch', 2, 30, { notes: SIDES }),
    ],
  },
]

const PROGRESS = (weeks: number) =>
  Array.from({ length: weeks }, (_, i) =>
    i === 0
      ? 'Week 1: learn the exercises and find your weights. Leave 2–3 reps in the tank.'
      : i === weeks - 1 && weeks >= 6
        ? `Week ${i + 1}: lighter week. Same exercises, about half the sets, to recover.`
        : `Week ${i + 1}: add a little weight or one more rep than last week, with good form.`,
  )

export const STARTER_PROGRAMS: StarterProgram[] = [
  {
    name: 'Beginner Full Body (3 days)',
    description:
      'New to the gym? Three full-body sessions a week with simple machine and dumbbell exercises. Learn the movements and build a habit.',
    durationWeeks: 4,
    week: [
      { day: 1, workout: 'Beginner · Full Body A' },
      { day: 3, workout: 'Beginner · Full Body B' },
      { day: 5, workout: 'Beginner · Full Body A' },
    ],
    weekNotes: PROGRESS(4),
  },
  {
    name: 'Push Pull Legs (3 days)',
    description:
      'The classic split: push (chest, shoulders, triceps), pull (back, biceps) and legs, once each a week. Great for building muscle with a busy schedule.',
    durationWeeks: 6,
    week: [
      { day: 1, workout: 'PPL · Push A' },
      { day: 3, workout: 'PPL · Pull A' },
      { day: 5, workout: 'PPL · Legs A' },
    ],
    weekNotes: PROGRESS(6),
  },
  {
    name: 'Push Pull Legs (6 days)',
    description:
      'Push, pull and legs twice a week with two different sessions each. For people with some gym experience who want to build muscle fast.',
    durationWeeks: 6,
    week: [
      { day: 1, workout: 'PPL · Push A' },
      { day: 2, workout: 'PPL · Pull A' },
      { day: 3, workout: 'PPL · Legs A' },
      { day: 4, workout: 'PPL · Push B' },
      { day: 5, workout: 'PPL · Pull B' },
      { day: 6, workout: 'PPL · Legs B' },
    ],
    weekNotes: PROGRESS(6),
  },
  {
    name: 'Upper Lower (4 days)',
    description:
      'Upper body and lower body twice a week: one heavier strength day and one lighter volume day each. Builds strength and muscle together.',
    durationWeeks: 6,
    week: [
      { day: 1, workout: 'Upper A (Strength)' },
      { day: 2, workout: 'Lower A (Strength)' },
      { day: 4, workout: 'Upper B (Volume)' },
      { day: 5, workout: 'Lower B (Volume)' },
    ],
    weekNotes: PROGRESS(6),
  },
  {
    name: 'Fat Loss: Strength & Cardio (4 days)',
    description:
      'Two full-body strength sessions to keep your muscle, one interval session and one long easy cardio day. Pair it with your calorie target on Fuel.',
    durationWeeks: 4,
    week: [
      { day: 1, workout: 'Fat Loss · Strength A' },
      { day: 2, workout: 'Fat Loss · Intervals' },
      { day: 4, workout: 'Fat Loss · Strength B' },
      { day: 6, workout: 'Fat Loss · Zone 2 Cardio' },
    ],
    weekNotes: PROGRESS(4),
  },
]
