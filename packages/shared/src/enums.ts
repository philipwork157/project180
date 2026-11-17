// Fixed value lists shared by the database, the API and the app.

/**
 * owner = sees every client and coach; admin = a coach who sees only their own clients;
 * member = a client; platform = the developer who runs the platform (Claude, costs, email). A
 * platform admin is not staff: they never see the gym's people or their data, only the
 * Platform page. Made only with `bun run admin:create`, never from the dashboard.
 */
export const ROLES = ['owner', 'admin', 'member', 'platform'] as const
export type Role = (typeof ROLES)[number]

/** Owners and coaches: the gym's own people who manage clients. Never the platform admin. */
export const isStaff = (role: Role | string | undefined): boolean =>
  role === 'owner' || role === 'admin'
export const isOwner = (role: Role | string | undefined): boolean => role === 'owner'
/** A client (role `member`): sees only themselves and their own program. */
export const isClient = (role: Role | string | undefined): boolean => role === 'member'
/** The developer: only the Platform page in the admin, never the phone app. */
export const isPlatform = (role: Role | string | undefined): boolean => role === 'platform'
/** Who may sign in to the admin dashboard: staff and the platform admin. */
export const canUseAdmin = (role: Role | string | undefined): boolean =>
  isStaff(role) || isPlatform(role)
export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Coach',
  member: 'Client',
  platform: 'Platform admin',
}

/** How a group of exercises in a workout is done. */
export const GROUP_KINDS = ['superset', 'circuit', 'interval'] as const
export type GroupKind = (typeof GROUP_KINDS)[number]
export const GROUP_KIND_LABELS: Record<GroupKind, string> = {
  superset: 'Superset',
  circuit: 'Circuit',
  interval: 'Intervals',
}

/** What kind of training an exercise is: decides filters and which targets make sense. */
export const EXERCISE_CATEGORIES = ['strength', 'cardio', 'mobility'] as const
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number]
export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  mobility: 'Mobility & stretching',
}

/** Where an exercise sits in a workout. Warm-up sets don't count towards volume or records. */
export const WORKOUT_SECTIONS = ['warm_up', 'main', 'cool_down'] as const
export type WorkoutSection = (typeof WORKOUT_SECTIONS)[number]
export const WORKOUT_SECTION_LABELS: Record<WorkoutSection, string> = {
  warm_up: 'Warm-up',
  main: 'Main',
  cool_down: 'Cool-down',
}

/** A client's goals (main goal plus any extra focus areas). */
export const GOALS = [
  'lose_weight',
  'build_muscle',
  'get_stronger',
  'get_fitter',
  'running',
  'triathlon',
  'hybrid',
  'mobility',
  'eat_better',
] as const
export type Goal = (typeof GOALS)[number]
export const GOAL_LABELS: Record<Goal, string> = {
  lose_weight: 'Lose weight',
  build_muscle: 'Build muscle',
  get_stronger: 'Get stronger',
  get_fitter: 'Get fitter & healthier',
  running: 'Running',
  triathlon: 'Triathlon',
  hybrid: 'Hybrid training',
  mobility: 'Mobility & flexibility',
  eat_better: 'Eat better',
}

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]
export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export const TRAINING_PLACES = ['gym', 'home', 'outdoors'] as const
export type TrainingPlace = (typeof TRAINING_PLACES)[number]
export const TRAINING_PLACE_LABELS: Record<TrainingPlace, string> = {
  gym: 'Gym',
  home: 'Home',
  outdoors: 'Outdoors',
}

export const SEXES = ['female', 'male'] as const
export type Sex = (typeof SEXES)[number]

export const WEIGHT_UNITS = ['kg', 'lb'] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

export const MUSCLE_GROUPS = [
  'legs',
  'glutes',
  'chest',
  'back',
  'shoulders',
  'arms',
  'core',
  'pelvic_floor',
  'full_body',
  'cardio',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'band',
  'kettlebell',
  'other',
] as const
export type Equipment = (typeof EQUIPMENT)[number]

/** Decides which inputs a set row shows. */
export const TRACKING_TYPES = ['weight_reps', 'reps', 'time', 'distance_time'] as const
export type TrackingType = (typeof TRACKING_TYPES)[number]

/** scheduled = queued to take over from the current program on its start date. */
export const ENROLLMENT_STATUS = ['active', 'scheduled', 'completed', 'cancelled'] as const
export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[number]

/**
 * abandoned = stopped early (sets were logged; they stay, but it doesn't count as done);
 * cancelled = started by accident or closed with nothing logged: hidden from the client's
 * history, still shown to their coach.
 */
export const SESSION_STATUS = ['in_progress', 'completed', 'abandoned', 'cancelled'] as const
export type SessionStatus = (typeof SESSION_STATUS)[number]

/** A coach's reaction to a client's workout or one exercise in it. */
export const FEEDBACK_KINDS = ['like', 'comment'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  legs: 'Legs',
  glutes: 'Glutes',
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  pelvic_floor: 'Pelvic floor',
  full_body: 'Full body',
  cardio: 'Cardio',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  band: 'Band',
  kettlebell: 'Kettlebell',
  other: 'Other',
}

export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Weight × reps',
  reps: 'Reps only',
  time: 'Time',
  distance_time: 'Distance + time',
}

/**
 * Heart-rate training zones (percent of maximum heart rate) with the "talk test", so people
 * without a heart-rate monitor can still tell which zone they're in.
 */
export const HR_ZONES: Record<1 | 2 | 3 | 4 | 5, { name: string; percent: string; feel: string }> =
  {
    1: { name: 'Very easy', percent: '50–60%', feel: 'Recovery pace. You could chat all day.' },
    2: {
      name: 'Easy',
      percent: '60–70%',
      feel: 'Comfortable and steady. You can still hold a conversation. Builds endurance.',
    },
    3: {
      name: 'Moderate',
      percent: '70–80%',
      feel: 'Breathing harder. You can speak in short sentences.',
    },
    4: { name: 'Hard', percent: '80–90%', feel: 'Tough to keep up. Only a few words at a time.' },
    5: { name: 'Max', percent: '90–100%', feel: 'All-out effort for short bursts. No talking.' },
  }

export function hrZone(zone: number | null | undefined) {
  return zone && zone >= 1 && zone <= 5 ? HR_ZONES[zone as 1 | 2 | 3 | 4 | 5] : null
}

/**
 * How active someone is in everyday life, NOT counting workouts: those are added to each day's
 * calories from what they log (the MyFitnessPal way), so they're never counted twice.
 */
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'active', 'very_active'] as const
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]
export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Mostly sitting (desk job)',
  light: 'On their feet some of the day',
  active: 'On their feet most of the day',
  very_active: 'Physical job (builder, farm)',
}
