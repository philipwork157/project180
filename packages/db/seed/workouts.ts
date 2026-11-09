// Starter workouts and programs. Exercise names must match seed/exercises.ts.

/** [exercise, sets, reps min, reps max, seconds (timed only), rest seconds] */
export type Item = [string, number, number | null, number | null, number | null, number]

export interface WorkoutSeed {
  name: string
  description: string
  minutes: number
  items: Item[]
}

const r = (name: string, sets: number, min: number, max: number, rest = 90): Item => [
  name,
  sets,
  min,
  max,
  null,
  rest,
]
const t = (name: string, sets: number, seconds: number, rest = 45): Item => [
  name,
  sets,
  null,
  null,
  seconds,
  rest,
]

export const WORKOUTS: WorkoutSeed[] = [
  {
    name: 'Full Body A',
    description: 'Squat, push and pull. A good default for 2–3 days a week.',
    minutes: 50,
    items: [
      r('Barbell Back Squat', 3, 6, 8, 120),
      r('Dumbbell Bench Press', 3, 8, 10),
      r('Seated Cable Row', 3, 10, 12),
      r('Dumbbell Romanian Deadlift', 3, 10, 12),
      r('Dumbbell Lateral Raise', 2, 12, 15, 60),
      t('Plank', 3, 40),
    ],
  },
  {
    name: 'Full Body B',
    description: 'Hinge, press and pull. Alternate with Full Body A.',
    minutes: 50,
    items: [
      r('Romanian Deadlift', 3, 8, 10, 120),
      r('Seated Dumbbell Shoulder Press', 3, 8, 10),
      r('Lat Pulldown', 3, 10, 12),
      r('Walking Lunge', 3, 10, 12),
      r('Cable Curl', 2, 12, 15, 60),
      r('Dead Bug', 3, 10, 12, 45),
    ],
  },
  {
    name: 'Glutes & Hamstrings',
    description: 'Heavy hip thrusts first, then hinge and burnout work.',
    minutes: 55,
    items: [
      r('Barbell Hip Thrust', 4, 8, 12, 120),
      r('Romanian Deadlift', 3, 8, 10, 120),
      r('Bulgarian Split Squat', 3, 10, 12),
      r('Cable Glute Kickback', 3, 12, 15, 60),
      r('Hip Abduction Machine', 3, 15, 20, 60),
      r('Seated Leg Curl', 3, 10, 12, 60),
    ],
  },
  {
    name: 'Lower Body',
    description: 'Quads, glutes and calves.',
    minutes: 55,
    items: [
      r('Barbell Back Squat', 4, 6, 8, 150),
      r('Leg Press', 3, 10, 12, 120),
      r('Barbell Hip Thrust', 3, 8, 12, 90),
      r('Leg Extension', 3, 12, 15, 60),
      r('Lying Leg Curl', 3, 10, 12, 60),
      r('Standing Calf Raise', 3, 12, 15, 45),
    ],
  },
  {
    name: 'Upper Body',
    description: 'Chest, back, shoulders and arms.',
    minutes: 55,
    items: [
      r('Barbell Bench Press', 4, 6, 8, 150),
      r('Barbell Row', 4, 8, 10, 120),
      r('Seated Dumbbell Shoulder Press', 3, 8, 10),
      r('Lat Pulldown', 3, 10, 12),
      r('Dumbbell Lateral Raise', 3, 12, 15, 60),
      r('Tricep Rope Pushdown', 2, 12, 15, 60),
      r('Hammer Curl', 2, 12, 15, 60),
    ],
  },
  {
    name: 'Push',
    description: 'Chest, shoulders and triceps.',
    minutes: 50,
    items: [
      r('Barbell Bench Press', 4, 6, 8, 150),
      r('Incline Dumbbell Press', 3, 8, 10),
      r('Overhead Press', 3, 6, 8, 120),
      r('Cable Fly', 3, 12, 15, 60),
      r('Dumbbell Lateral Raise', 3, 12, 15, 60),
      r('Overhead Cable Tricep Extension', 3, 10, 12, 60),
    ],
  },
  {
    name: 'Pull',
    description: 'Back, rear shoulders and biceps.',
    minutes: 50,
    items: [
      r('Pull-Up', 3, 5, 8, 120),
      r('Barbell Row', 3, 8, 10, 120),
      r('Close-Grip Lat Pulldown', 3, 10, 12),
      r('Face Pull', 3, 12, 15, 60),
      r('Incline Dumbbell Curl', 3, 10, 12, 60),
      r('Hammer Curl', 2, 12, 15, 60),
    ],
  },
  {
    name: 'Legs',
    description: 'Squat, hinge and single-leg work.',
    minutes: 55,
    items: [
      r('Barbell Front Squat', 4, 6, 8, 150),
      r('Romanian Deadlift', 3, 8, 10, 120),
      r('Walking Lunge', 3, 10, 12),
      r('Seated Leg Curl', 3, 10, 12, 60),
      r('Leg Extension', 3, 12, 15, 60),
      r('Seated Calf Raise', 3, 15, 20, 45),
    ],
  },
  {
    name: 'Home Bodyweight',
    description: 'No equipment needed. Good for travel days.',
    minutes: 30,
    items: [
      r('Bodyweight Squat', 3, 15, 20, 45),
      r('Push-Up', 3, 8, 15, 60),
      r('Glute Bridge', 3, 15, 20, 45),
      r('Bodyweight Lunge', 3, 10, 12, 45),
      r('Superman', 3, 12, 15, 45),
      t('Plank', 3, 45),
    ],
  },
  {
    name: 'Core',
    description: 'Short abs and stability finisher.',
    minutes: 20,
    items: [
      r('Dead Bug', 3, 10, 12, 30),
      r('Hanging Knee Raise', 3, 10, 15, 45),
      r('Cable Crunch', 3, 12, 15, 45),
      r('Pallof Press', 3, 10, 12, 30),
      t('Side Plank', 2, 30, 30),
    ],
  },
  {
    name: 'Conditioning',
    description: 'Heart-rate work. Go hard, rest, repeat.',
    minutes: 30,
    items: [
      t('Rowing Machine', 1, 300, 60),
      r('Kettlebell Swing', 4, 15, 20, 45),
      r('Burpee', 3, 10, 12, 60),
      t('Assault Bike', 4, 30, 60),
      t('Mountain Climber', 3, 30, 30),
    ],
  },
  {
    name: 'Pelvic Floor & Deep Core',
    description:
      'Gentle and safe before or after pregnancy. Breathe out on the effort and relax fully between reps.',
    minutes: 20,
    items: [
      t('Diaphragmatic Breathing', 1, 120, 15),
      r('Pelvic Floor Lift (Kegel)', 2, 8, 10, 30),
      r('Pelvic Floor Quick Flicks', 2, 10, 10, 30),
      r('Pelvic Tilt', 2, 10, 12, 30),
      r('Heel Slide', 2, 8, 10, 30),
      r('Bridge with Pelvic Floor Lift', 3, 10, 12, 45),
      r('Clamshell with Pelvic Floor Lift', 2, 10, 12, 30),
      r('Squat with Pelvic Floor Lift', 2, 8, 10, 45),
      t('Happy Baby', 1, 60, 0),
    ],
  },
  {
    name: 'Hamstring Focus',
    description: 'Back of the thighs: hinge, curl and bridge. Pairs well with a quad day.',
    minutes: 50,
    items: [
      r('Romanian Deadlift', 4, 6, 10, 120),
      r('Seated Leg Curl', 3, 10, 12, 75),
      r('Barbell Hip Thrust', 3, 8, 12, 90),
      r('Lying Leg Curl', 3, 10, 12, 75),
      r('Nordic Hamstring Curl', 3, 4, 6, 90),
      r('Back Extension', 2, 12, 15, 60),
    ],
  },
  {
    name: 'Chest & Triceps',
    description: 'Classic push day for the chest and the back of the arms.',
    minutes: 55,
    items: [
      r('Barbell Bench Press', 4, 6, 8, 150),
      r('Incline Dumbbell Press', 3, 8, 10, 90),
      r('Cable Fly', 3, 12, 15, 60),
      r('Weighted Dip', 3, 8, 10, 90),
      r('EZ-Bar Skull Crusher', 3, 10, 12, 75),
      r('Tricep Rope Pushdown', 3, 12, 15, 60),
    ],
  },
  {
    name: 'Back & Biceps',
    description: 'Classic pull day: width, thickness and arms.',
    minutes: 55,
    items: [
      r('Pull-Up', 4, 6, 10, 120),
      r('Barbell Row', 3, 8, 10, 120),
      r('Single-Arm Lat Pulldown', 3, 10, 12, 60),
      r('Chest-Supported T-Bar Row', 3, 10, 12, 75),
      r('EZ-Bar Curl', 3, 8, 12, 60),
      r('Hammer Curl', 3, 10, 12, 60),
    ],
  },
  {
    name: 'Shoulders & Arms',
    description: 'Delts from every angle, finished with biceps and triceps.',
    minutes: 50,
    items: [
      r('Seated Dumbbell Shoulder Press', 4, 8, 10, 120),
      r('Cable Lateral Raise', 3, 12, 15, 45),
      r('Reverse Pec Deck', 3, 12, 15, 45),
      r('Dumbbell Shrug', 3, 10, 12, 60),
      r('Bayesian Cable Curl', 3, 10, 12, 45),
      r('Overhead Cable Tricep Extension', 3, 10, 12, 45),
    ],
  },
  {
    name: 'Full-Body Mobility',
    description: 'Twenty minutes to loosen hips, spine and shoulders. Great on rest days.',
    minutes: 20,
    items: [
      r('Cat-Cow', 1, 8, 10, 0),
      r("World's Greatest Stretch", 1, 5, 5, 0),
      r('Hip 90/90 Switch', 2, 8, 8, 15),
      r('Thoracic Spine Rotation (Open Book)', 2, 8, 8, 15),
      r('Wall Slide', 2, 10, 10, 15),
      t('Couch Stretch', 2, 45, 15),
      t('Half Pigeon', 2, 45, 15),
      t("Child's Pose", 1, 60, 0),
    ],
  },
  {
    name: 'Yoga Flow',
    description: 'A calm flow for balance, breath and flexibility.',
    minutes: 25,
    items: [
      r('Sun Salutation', 3, 1, 1, 15),
      t('Warrior II', 2, 30, 10),
      t('Triangle Pose', 2, 30, 10),
      t('Tree Pose', 2, 30, 10),
      t('Low Lunge (Anjaneyasana)', 2, 30, 10),
      t('Bridge Pose', 2, 30, 15),
      t('Supine Spinal Twist', 2, 45, 0),
      t('Corpse Pose (Savasana)', 1, 180, 0),
    ],
  },
  {
    name: 'Seniors: Strength & Balance',
    description: 'Gentle, chair-supported strength and balance work.',
    minutes: 25,
    items: [
      r('Sit-to-Stand', 3, 8, 12, 60),
      r('Heel Raise (Holding Support)', 2, 10, 15, 45),
      r('Standing Hip Abduction', 2, 10, 12, 45),
      r('Wall Push-Up', 2, 8, 12, 45),
      r('Seated Marching', 2, 10, 20, 30),
      t('Single-Leg Balance', 2, 20, 30),
      r('Tandem Walk', 2, 10, 10, 30),
    ],
  },
]
