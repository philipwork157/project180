import type {
  EnrollmentStatus,
  Equipment,
  ExerciseCategory,
  ExperienceLevel,
  FeedbackKind,
  Goal,
  GroupKind,
  MuscleGroup,
  Role,
  SessionStatus,
  Sex,
  TrackingType,
  TrainingPlace,
  WeightUnit,
  WorkoutSection,
} from './enums'

/** The signed-in user as the API returns it from /api/me. */
export interface Me {
  id: number
  name: string
  email: string
  role: Role
  timezone: string
  weightUnit: WeightUnit
  /** Signed in with a temporary password from their coach: they must choose their own first. */
  mustChangePassword: boolean
}

export interface Exercise {
  id: number
  name: string
  muscleGroup: MuscleGroup
  category: ExerciseCategory
  equipment: Equipment
  trackingType: TrackingType
  instructions: string | null
  /** Other names and the muscles it works, for search. */
  keywords: string | null
  /** Photos: see exercisePhotos(). */
  imageKey: string | null
  videoUrl: string | null
  createdBy: number
  createdAt: string
  updatedAt: string
}

export interface ClientProfile {
  phone: string | null
  birthDate: string | null
  sex: Sex | null
  heightCm: number | null
  goalWeightKg: number | null
  mainGoal: Goal | null
  focusAreas: Goal[]
  places: TrainingPlace[]
  experience: ExperienceLevel | null
  daysPerWeek: number | null
  targetEvent: string | null
  targetEventDate: string | null
  notes: string | null
  /** Latest weigh-in, for the card. */
  latestWeightKg: number | null
}

export interface UserSummary {
  id: number
  name: string
  email: string
  role: Role
  /** The coach who looks after them (clients), or null. */
  coachId: number | null
  coachName: string | null
  mainGoal: Goal | null
  createdAt: string
  /** Last time they used the app (or the admin), or null if never. */
  lastSeenAt: string | null
  /** Has a sign-in that hasn't ended (any device). With lastSeenAt it makes "active now". */
  signedIn: boolean
  /** Staff blocked their access: they can't sign in until unblocked. */
  blocked: boolean
}

/** One person on the People page: the summary row, before their details are opened. */
export interface DirectoryPerson extends UserSummary {
  /** Their current program, or null. */
  programName: string | null
  lastWorkoutAt: string | null
  /** Coaches: how many clients they coach. */
  clientCount: number
}

/** A page of the People list, with the head count of each tab. */
export interface PeoplePage {
  people: DirectoryPerson[]
  total: number
  page: number
  pageSize: number
  counts: { mine: number; clients: number; team: number }
}

/** One signed-in device (a Better Auth session). */
export interface SignedInDevice {
  id: number
  /** "iPhone · Safari", "Windows · Chrome", … */
  label: string
  /** Signed in to the phone app or the admin (null: from before this was recorded). */
  app: 'app' | 'admin' | null
  signedInAt: string
  /** When the sign-in was last renewed (roughly the last day it was used). */
  lastActiveAt: string
  expiresAt: string
  /** The device you're looking from right now. */
  current: boolean
}

/** How much someone uses the app: for their coach. */
export interface PersonActivity {
  lastSeenAt: string | null
  /** Seen in the last few minutes and still signed in. */
  activeNow: boolean
  /** Staff blocked their access. */
  blocked: boolean
  /** The last 7 days, oldest first, in their time zone: seconds with the app open each day. */
  days: { date: string; seconds: number }[]
  /** Still waiting to choose their own password. */
  mustChangePassword: boolean
  devices: SignedInDevice[]
}

export interface WorkoutExerciseItem {
  exerciseId: number
  exerciseName: string
  muscleGroup: MuscleGroup
  trackingType: TrackingType
  /** The exercise's form cue and photos, for "how to do it" in the app. */
  instructions: string | null
  imageKey: string | null
  /** A link to a demo video (YouTube, Vimeo…), opened outside the app. */
  videoUrl: string | null
  targetSets: number
  targetRepsMin: number | null
  targetRepsMax: number | null
  /** Reps for each set, e.g. [12, 10, 10, 8], instead of a range. Its length is targetSets. */
  targetRepsPerSet: number[] | null
  /** Done with bodyweight: log reps only, no weight. */
  bodyweight: boolean
  targetSeconds: number | null
  restSeconds: number
  section: WorkoutSection
  targetDistanceM: number | null
  /** Seconds per km. */
  targetPaceSeconds: number | null
  targetHrZone: number | null
  supersetGroup: number | null
  notes: string | null
  /** In a session: the exercise the workout asked for, when the client swapped it. */
  swappedFrom?: { exerciseId: number; exerciseName: string } | null
}

/** How exercises sharing a supersetGroup number are done. */
export interface WorkoutGroup {
  groupNumber: number
  kind: GroupKind
  /** Times through the whole group. */
  rounds: number
  /** Intervals only: seconds of work, then rest, per exercise. */
  workSeconds: number | null
  restSeconds: number | null
}

export interface WorkoutSummary {
  id: number
  name: string
  description: string | null
  estimatedMinutes: number | null
  createdBy: number
  /** Set on a client's personal copy; null = in the library. */
  clientId: number | null
  clientName: string | null
  sourceWorkoutId: number | null
  exerciseCount: number
  muscleGroups: MuscleGroup[]
  archived: boolean
  updatedAt: string
}

export interface WorkoutDetail extends WorkoutSummary {
  exercises: WorkoutExerciseItem[]
  groups: WorkoutGroup[]
}

export interface ProgramDay {
  id: number
  weekNumber: number
  dayNumber: number
  workoutId: number | null
  checkinRequired: boolean
  notes: string | null
}

export interface ProgramSummary {
  id: number
  name: string
  description: string | null
  durationWeeks: number
  createdBy: number
  /** Set on a client's personal copy (made when assigned); null = in the library. */
  clientId: number | null
  clientName: string | null
  sourceProgramId: number | null
  workoutDays: number
  archived: boolean
  updatedAt: string
}

export interface ProgramDetail extends ProgramSummary {
  days: ProgramDay[]
}

export interface EnrollmentSummary {
  id: number
  userId: number
  userName: string
  programId: number
  programName: string
  /** The library program their personal copy was made from. */
  sourceProgramId: number | null
  durationWeeks: number
  startDate: string
  status: EnrollmentStatus
}

/** Someone on their own copy of a library program, and whether that copy has fallen behind. */
export interface ProgramCopySummary {
  enrollmentId: number
  userId: number
  userName: string
  /** Their personal copy. */
  programId: number
  startDate: string
  /** The library program or its workouts changed after their copy was made or last updated. */
  behind: boolean
  /** Their copy (or one of its workouts) was changed just for them; updating replaces that. */
  changedForThem: boolean
}

export interface PlanDay {
  date: string
  weekNumber: number
  dayNumber: number
  programDayId: number | null
  workoutId: number | null
  workoutName: string | null
  checkinRequired: boolean
  state: 'done' | 'planned' | 'rest' | 'missed'
  isToday: boolean
  /** The finished session for this day, when done. */
  sessionId: number | null
}

export interface MyPlan {
  enrollment: EnrollmentSummary
  /** When their coach put them on this program, and last changed their copy (for the bell). */
  assigned: {
    at: string
    updatedAt: string | null
    coachName: string | null
    /** When it took over from the previous program, if it was queued. */
    startedAt: string | null
  }
  /** The program their coach queued to take over after this one, if any. */
  next: {
    enrollmentId: number
    programName: string
    startDate: string
    durationWeeks: number
    coachName: string | null
  } | null
  today: string
  days: PlanDay[]
  workouts: Record<
    number,
    { id: number; name: string; estimatedMinutes: number | null; exerciseCount: number }
  >
}

/** How someone is getting on with their current program (admin view). */
export interface PersonProgress {
  plan: MyPlan
  workoutDays: number
  done: number
  missed: number
  currentWeek: number
  volumeKg: number
  minutes: number
  avgFeeling: number | null
  lastWorkoutAt: string | null
  recent: SessionSummary[]
  /** What a reset wipes. */
  impact: { sessions: number; loggedSets: number; checkins: number }
}

/** A program someone used to be on: archived (or replaced), with its history kept. */
export interface PastProgram {
  enrollmentId: number
  programId: number
  programName: string
  durationWeeks: number
  startDate: string
  /** completed = ran its course and the next program took over; cancelled = archived or replaced. */
  status: 'completed' | 'cancelled'
  /** When it was archived or replaced. */
  endedAt: string
  workouts: number
  volumeKg: number
  lastWorkoutAt: string | null
  /** Their finished workouts on it, newest first (at most 100). */
  recent: SessionSummary[]
  /** What deleting it wipes. */
  impact: { sessions: number; loggedSets: number; checkins: number }
}

/** A program queued to take over on its start date. */
export interface UpcomingProgram {
  enrollmentId: number
  /** Their own copy (edit it before it starts). */
  programId: number
  programName: string
  durationWeeks: number
  startDate: string
}

export interface PersonPrograms {
  progress: PersonProgress | null
  upcoming: UpcomingProgram[]
  past: PastProgram[]
}

export interface LoggedSet {
  clientUuid: string
  exerciseId: number
  exerciseName: string
  setNumber: number
  isWarmup: boolean
  weightKg: number | null
  reps: number | null
  durationSeconds: number | null
  distanceM: number | null
  rpe: number | null
}

export interface PreviousSet {
  setNumber: number
  weightKg: number | null
  reps: number | null
  durationSeconds: number | null
  distanceM: number | null
}

export interface SessionDetail {
  id: number
  clientUuid: string
  status: SessionStatus
  workoutId: number | null
  workoutName: string | null
  programDayId: number | null
  scheduledDate: string | null
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  feeling: number | null
  notes: string | null
  /** What was prescribed when the session started (saved with it), or the workout as it is now for older sessions. */
  exercises: WorkoutExerciseItem[]
  groups: WorkoutGroup[]
  sets: LoggedSet[]
  /** Last completed session's sets per exercise, for "last time" hints and pre-filling. */
  previous: Record<number, PreviousSet[]>
}

/** A coach's like or comment on a workout (exerciseId null) or one exercise in it. */
export interface SessionFeedback {
  id: number
  sessionId: number
  exerciseId: number | null
  kind: FeedbackKind
  body: string | null
  /** Null when the coach's account was removed. */
  authorId: number | null
  authorName: string | null
  createdAt: string
  /** When the client saw it; null while it's new. */
  readAt: string | null
}

/** Unread feedback for the client's notifications, with what it was on. */
export interface FeedbackNews extends SessionFeedback {
  workoutName: string | null
  exerciseName: string | null
}

/** One chat message between a client and their coach. */
export interface ChatMessage {
  id: number
  clientUuid: string
  senderId: number | null
  /** Null when the sender's account was removed. */
  senderName: string | null
  body: string
  createdAt: string
}

/** A page of one conversation, oldest first. */
export interface ChatThread {
  messages: ChatMessage[]
  /** There are older messages: ask again with before = the first id. */
  hasMore: boolean
  /** The newest message the other side has read (your sent ones up to here show "Seen"). */
  seenUpTo: number
  /** The last message you've read. */
  readUpTo: number
}

/** Messages from your coach you haven't read, and the newest of them (the bell and the banner). */
export interface ChatUnread {
  unread: number
  latest: ChatMessage | null
}

/** A client's conversation in the coach's inbox. */
export interface ChatSummary {
  clientId: number
  name: string
  unread: number
  last: { body: string; createdAt: string; fromClient: boolean; fromMe: boolean } | null
}

export interface SessionSummary {
  id: number
  /** Coaches' lists also show workouts stopped early or cancelled; clients see completed only. */
  status: SessionStatus
  workoutName: string | null
  startedAt: string
  durationSeconds: number | null
  feeling: number | null
  volumeKg: number
  setCount: number
  /** Exercises swapped during the workout, in workout order. */
  swaps: ExerciseSwap[]
}

/** One exercise swapped for another during a workout. */
export interface ExerciseSwap {
  from: string
  to: string
}

/** An exercise a client can swap to: just enough to show and search it. */
export interface SwapCandidate {
  id: number
  name: string
  muscleGroup: MuscleGroup
  equipment: Equipment
  trackingType: TrackingType
  keywords: string | null
  imageKey: string | null
}

/** Everything the swap sheet needs, fetched once when a workout opens (works with poor signal). */
export interface SwapOptions {
  /** Every exercise in use (not archived), for search. */
  exercises: SwapCandidate[]
  /** The coach's alternatives per exercise id, in their order. */
  coach: Record<number, number[]>
  /** What this person swapped each exercise for before, most recent first. */
  mine: Record<number, number[]>
}

export interface FinishResult {
  session: SessionSummary
  records: Array<{ exerciseId: number; exerciseName: string; weightKg: number }>
}

export interface MyStats {
  workouts: number
  volumeKg: number
  avgMinutes: number | null
  avgFeeling: number | null
  weeks: Array<{ weekStart: string; workouts: number; volumeKg: number; minutes: number }>
  records: Array<{
    exerciseId: number
    exerciseName: string
    bestWeightKg: number
    bestOneRepMax: number | null
  }>
  recent: SessionSummary[]
  bodyWeight: Array<{ date: string; weightKg: number }>
}

/** A coach's view of one person's progress: the phone's numbers plus more detail. */
export interface PersonStats extends MyStats {
  /** Program workouts due in the window on their current program: done, and due so far. */
  planned: { done: number; due: number } | null
  /** Their most-logged weighted exercises, one point per workout (their local date). */
  strength: Array<{
    exerciseId: number
    exerciseName: string
    points: Array<{ date: string; bestWeightKg: number; oneRepMax: number | null }>
  }>
  /** What they swapped during workouts in the window, most often first. */
  swaps: Array<{ fromName: string; toName: string; times: number; lastDate: string | null }>
}

/** The admin home: how the clients you look after are doing. */
export interface AdminOverview {
  clients: {
    total: number
    /** Using the app right now. */
    activeNow: number
    /** Opened the app in the last 7 days. */
    activeThisWeek: number
    onProgram: number
  }
  /** The last 7 days. */
  week: {
    workouts: number
    /** The 7 days before, for the trend. */
    workoutsLastWeek: number
    volumeKg: number
    minutes: number
    avgFeeling: number | null
    /** Seconds with the app open, all clients together. */
    appSeconds: number
    /** Program workouts due so far this week: done, and due in total (done + missed). */
    plannedDone: number
    plannedTotal: number
  }
  /** Workouts finished per day, last 14 days, oldest first. */
  daily: Array<{ date: string; workouts: number }>
  /** Clients who could use a nudge. */
  attention: Array<{
    userId: number
    name: string
    reason: 'not_started' | 'no_program' | 'missed' | 'quiet'
    detail: string
  }>
  /** Latest finished workouts. */
  recent: Array<SessionSummary & { userId: number; name: string }>
  /** Workouts clients are doing right now (started in the last 4 hours, not finished). */
  live: Array<SessionSummary & { userId: number; name: string }>
  library: { exercises: number; workouts: number; programs: number }
}

/** Whether this site can push, and the key a phone needs to subscribe. */
export interface PushSetup {
  configured: boolean
  publicKey: string | null
}

/** One YouTube result for "how to do this exercise". */
export interface VideoResult {
  videoId: string
  title: string
  channel: string
  thumbnail: string
}

export interface VideoSearch {
  results: VideoResult[]
  /** False until a YouTube API key is set: the app then just opens YouTube. */
  configured: boolean
  /** The same search on youtube.com, as a fallback. */
  searchUrl: string
}

/** What deleting a person removed, and what was handed to the owner who deleted them. */
export interface DeletePersonResult {
  removed: { workouts: number; checkins: number }
  handedOver: { clients: number; exercises: number; workouts: number; programs: number }
}
