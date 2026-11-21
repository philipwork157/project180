// Endurance and competition training for the starter library: road and trail running, cycling,
// swimming, triathlon, Hyrox and powerlifting. Same shape as seed/exercises.ts:
// [name, muscle group, equipment, tracked by, form cue, type?]. Cardio rows default to the
// cardio type. Distance + time rows also take pace, heart-rate zone, power and climb targets.
import type { ExerciseSeed } from './exercises'

export const ENDURANCE_EXERCISES: ExerciseSeed[] = [
  // ── Road running ─────────────────────────────────────────────────────────
  ['Recovery Run', 'cardio', 'other', 'distance_time', 'Very easy, shorter than usual. Zone 1–2.'],
  [
    'Strides',
    'cardio',
    'other',
    'distance_time',
    'About 100 m: build smoothly to fast, stay relaxed, walk back. Not a sprint.',
  ],
  [
    'Fartlek Run',
    'cardio',
    'other',
    'distance_time',
    'Mix fast and easy stretches by feel: a lamp post, a hill, a song.',
  ],
  [
    'Progression Run',
    'cardio',
    'other',
    'distance_time',
    'Start easy and finish each third a little faster. Last part near threshold.',
  ],
  [
    'Race-Pace Run',
    'cardio',
    'other',
    'distance_time',
    'Run the set distance at goal race pace. Practise drinks and gels too.',
  ],
  [
    'Threshold Intervals (Run)',
    'cardio',
    'other',
    'distance_time',
    'Comfortably hard, about 1-hour race pace. Short easy jog between reps.',
  ],
  [
    'Track Intervals',
    'cardio',
    'other',
    'distance_time',
    'Repeats of 400 m to 1.6 km at the set pace, rest between. Even splits.',
  ],
  [
    'Hill Repeats (Run)',
    'cardio',
    'other',
    'distance_time',
    'Strong up the hill, tall posture, quick arms. Jog or walk back down.',
  ],
  [
    '5 km Time Trial',
    'cardio',
    'other',
    'distance_time',
    'Warm up well, then run 5 km as fast as you can hold. Shows current fitness.',
  ],

  // ── Trail running ────────────────────────────────────────────────────────
  [
    'Power Hiking',
    'cardio',
    'other',
    'distance_time',
    'Steep climbs: hands on thighs, short steps, keep moving. Faster than running uphill.',
  ],
  [
    'Downhill Running',
    'cardio',
    'other',
    'distance_time',
    'Quick light steps, lean slightly forward, arms out for balance. Look ahead.',
  ],
  [
    'Trail Hill Repeats',
    'cardio',
    'other',
    'distance_time',
    'Run or power-hike up the trail climb, easy back down on good footing.',
  ],

  // ── Cycling ──────────────────────────────────────────────────────────────
  [
    'Indoor Trainer Ride',
    'cardio',
    'machine',
    'distance_time',
    'Your bike on a smart trainer. Fan on, water close, follow the power targets.',
  ],
  ['Recovery Ride', 'cardio', 'other', 'distance_time', 'Very easy spin, light gears, Zone 1.'],
  [
    'Sweet Spot Intervals',
    'cardio',
    'other',
    'time',
    'Just under threshold, about 88–93% FTP. Steady and seated.',
  ],
  [
    'Threshold Intervals (Bike)',
    'cardio',
    'other',
    'time',
    'Around 95–105% FTP: hard but steady for the whole rep.',
  ],
  [
    'VO2 Max Intervals (Bike)',
    'cardio',
    'other',
    'time',
    'Short hard efforts, about 110–120% FTP, with equal easy spinning between.',
  ],
  [
    'Hill Repeats (Bike)',
    'cardio',
    'other',
    'distance_time',
    'Seated or standing up the climb at the set power. Spin easy back down.',
  ],
  [
    'Cadence Drills',
    'cardio',
    'other',
    'time',
    'Light gear, spin faster than usual without bouncing on the saddle.',
  ],
  [
    'FTP Test (20 min)',
    'cardio',
    'other',
    'time',
    'Warm up, then 20 minutes as hard as you can hold evenly. FTP is about 95% of the average.',
  ],
  [
    'Mountain Bike Ride',
    'cardio',
    'other',
    'distance_time',
    'Loose arms, weight back on descents, look where you want to go.',
  ],

  // ── Swimming ─────────────────────────────────────────────────────────────
  [
    'Swim Drills',
    'cardio',
    'other',
    'distance_time',
    'Catch-up, fingertip drag or single arm. Slow and long, focus on one thing.',
  ],
  [
    'Pull Buoy Swim',
    'cardio',
    'other',
    'distance_time',
    'Buoy between the thighs, no kick: long reach and a strong pull.',
  ],
  [
    'CSS Intervals (Swim)',
    'cardio',
    'other',
    'distance_time',
    'Repeats at your threshold pace per 100 m, short rest at the wall.',
  ],
  [
    'Swim Time Trial (400 m)',
    'cardio',
    'other',
    'distance_time',
    'Even effort for 400 m. With a 200 m test it gives your threshold pace (CSS).',
  ],

  // ── Triathlon ────────────────────────────────────────────────────────────
  [
    'Transition Practice',
    'cardio',
    'other',
    'time',
    'Wetsuit off, helmet on, shoes, go. Then bike to run. Same layout every time.',
  ],

  // ── Hyrox ────────────────────────────────────────────────────────────────
  [
    'Compromised Run',
    'cardio',
    'other',
    'distance_time',
    'Run straight after a station. Settle into race pace within the first 200 m.',
  ],
  [
    'Sled Pull',
    'full_body',
    'other',
    'distance_time',
    'Rope hand over hand, sit back low, walk backwards to the line between pulls.',
  ],
  [
    'Sandbag Lunges',
    'legs',
    'other',
    'distance_time',
    'Bag across the back of the shoulders, back knee kisses the floor every step.',
  ],
  [
    'SkiErg Intervals',
    'cardio',
    'machine',
    'distance_time',
    'Hard pieces with easy pulling between. Hinge, arms and core together.',
  ],
  [
    'Hyrox Simulation',
    'cardio',
    'other',
    'time',
    '1 km run then a station, repeated. Race order or a shorter half version.',
  ],

  // ── Powerlifting ─────────────────────────────────────────────────────────
  [
    'Board Press',
    'chest',
    'barbell',
    'weight_reps',
    'Bench press down to a board on the chest, pause, press. Builds lockout.',
  ],
  [
    'Pin Press',
    'chest',
    'barbell',
    'weight_reps',
    'Bench press from pins set just above the chest, from a dead stop.',
  ],
  [
    'Pin Squat',
    'legs',
    'barbell',
    'weight_reps',
    'Squat down to safety pins at depth, settle, then drive up from a dead stop.',
  ],
  [
    'Larsen Press',
    'chest',
    'barbell',
    'weight_reps',
    'Bench press with legs straight out and off the floor. Stay tight through the core.',
  ],
  [
    'Spoto Press',
    'chest',
    'barbell',
    'weight_reps',
    'Bench press that stops an inch above the chest, pauses, then presses.',
  ],
  [
    'Paused Deadlift',
    'back',
    'barbell',
    'weight_reps',
    'Pause 2 seconds just below the knee, keep the lats tight, then finish.',
  ],
  [
    'Block Pull',
    'back',
    'barbell',
    'weight_reps',
    'Deadlift with the plates on blocks, bar about knee height. Builds lockout.',
  ],
]
