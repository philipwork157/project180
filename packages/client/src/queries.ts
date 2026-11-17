import type {
  AdminOverview,
  AuditPage,
  ChatSummary,
  ChatThread,
  ChatUnread,
  ClaudeConfig,
  ClaudeCosts,
  ClaudeFeatureSettings,
  ClientProfile,
  CoachFirstSteps,
  DatabaseSummary,
  EnrollmentSummary,
  ErrorSummary,
  Exercise,
  FeedbackNews,
  FoodDay,
  FoodPhotoSettings,
  FoodSearchResult,
  FoodSetup,
  FoodSummary,
  Invitation,
  InvitationForMe,
  Me,
  MyPlan,
  MyStats,
  PeoplePage,
  PersonActivity,
  PersonPrograms,
  PersonStats,
  PhotoLimit,
  PlatformCoach,
  PlatformHealth,
  PlatformPeople,
  ProgramCopySummary,
  ProgramDetail,
  ProgramSummary,
  QuickWorkoutOptions,
  QuickWorkoutsAccess,
  RecentFood,
  Recipe,
  RecipeListQuery,
  RecipePage,
  SavedMeal,
  SessionDetail,
  SessionFeedback,
  SignInSummary,
  StarterLibrary,
  StarterProgram,
  SwapOptions,
  UserSummary,
  VideoSearch,
  WaterDay,
  WaterSummary,
  WorkoutDetail,
  WorkoutSummary,
} from '@project180/shared'
import { keepPreviousData, type QueryClient, queryOptions } from '@tanstack/react-query'
import { ApiError, api } from './api'

/** The signed-in user, or null when signed out. */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<Me | null> => {
    try {
      const { user } = await api<{ user: Me }>('/me')
      return user
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null
      throw e
    }
  },
  staleTime: 5 * 60_000,
})

export const exercisesQuery = (archived = false) =>
  queryOptions({
    queryKey: ['exercises', { archived }],
    queryFn: async () =>
      (await api<{ exercises: Exercise[] }>(`/exercises${archived ? '?archived=1' : ''}`))
        .exercises,
  })

/**
 * Puts an exercise the server just sent back into the cached lists, so screens show it straight
 * away (replaced where it is; a new one is added to the active list). Refresh in the background too.
 */
export function putExercise(queryClient: QueryClient, exercise: Exercise, isNew = false) {
  const swap = (list: Exercise[] | undefined) =>
    list?.map((e) => (e.id === exercise.id ? exercise : e))
  queryClient.setQueryData(exercisesQuery(false).queryKey, (list) =>
    isNew && list ? [...list, exercise].sort((a, b) => a.name.localeCompare(b.name)) : swap(list),
  )
  queryClient.setQueryData(exercisesQuery(true).queryKey, swap)
}

/** The workout library; with `clientId`, plus that client's personal copies. */
export const workoutsQuery = (archived = false, clientId?: number | null) =>
  queryOptions({
    queryKey: ['workouts', { archived, clientId: clientId ?? null }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (archived) params.set('archived', '1')
      if (clientId) params.set('clientId', String(clientId))
      const qs = params.toString()
      return (await api<{ workouts: WorkoutSummary[] }>(`/workouts${qs ? `?${qs}` : ''}`)).workouts
    },
  })

export const workoutQuery = (id: number) =>
  queryOptions({
    queryKey: ['workouts', id],
    queryFn: async () => (await api<{ workout: WorkoutDetail }>(`/workouts/${id}`)).workout,
  })

export const programsQuery = (archived = false) =>
  queryOptions({
    queryKey: ['programs', { archived }],
    queryFn: async () =>
      (await api<{ programs: ProgramSummary[] }>(`/programs${archived ? '?archived=1' : ''}`))
        .programs,
  })

export const programQuery = (id: number) =>
  queryOptions({
    queryKey: ['programs', id],
    queryFn: async () => (await api<{ program: ProgramDetail }>(`/programs/${id}`)).program,
  })

/** People on their own copy of a library program, and whether each copy is behind it. */
export const programCopiesQuery = (programId: number) =>
  queryOptions({
    queryKey: ['programs', programId, 'copies'],
    queryFn: async () =>
      (await api<{ copies: ProgramCopySummary[] }>(`/programs/${programId}/copies`)).copies,
  })

/** Current programs; `mine` keeps only you and the clients you coach yourself. */
export const enrollmentsQuery = (programId?: number, mine = false) =>
  queryOptions({
    queryKey: ['enrollments', { programId, mine }],
    queryFn: async () =>
      (
        await api<{ enrollments: EnrollmentSummary[] }>(
          // Current programs only: no screen lists past ones from here.
          `/enrollments?status=active${programId ? `&programId=${programId}` : ''}${mine ? '&mine=1' : ''}`,
        )
      ).enrollments,
  })

/** Programs queued to take over from people's current ones on their start dates. */
export const queuedEnrollmentsQuery = queryOptions({
  queryKey: ['enrollments', 'scheduled'],
  queryFn: async () =>
    (await api<{ enrollments: EnrollmentSummary[] }>('/enrollments?status=scheduled')).enrollments,
})

/** A person's progress over the last `weeks` weeks (coach view). */
export const personStatsQuery = (userId: number, weeks: number) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'stats', weeks],
    queryFn: async () =>
      (await api<{ stats: PersonStats }>(`/admin/users/${userId}/stats?weeks=${weeks}`)).stats,
  })

export const personProgressQuery = (userId: number) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'progress'],
    queryFn: () => api<PersonPrograms>(`/admin/users/${userId}/progress`),
  })

/** One of a client's workouts in full, for the coach. Refreshes while they're still training. */
export const clientWorkoutQuery = (userId: number, sessionId: number) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'workouts', sessionId],
    queryFn: () =>
      api<{ session: SessionDetail; feedback: SessionFeedback[] }>(
        `/admin/users/${userId}/workouts/${sessionId}`,
      ),
    refetchInterval: (query) =>
      query.state.data?.session.status === 'in_progress' ? 10_000 : false,
  })

/** Your chat with your coach (phone app). Polled faster while the Chat screen is open. */
export const myChatQuery = queryOptions({
  queryKey: ['me', 'chat'],
  queryFn: () => api<{ thread: ChatThread; coach: { name: string } | null }>('/me/chat'),
})

/**
 * Unread messages from your coach and the newest of them: the Coach tab badge, the bell and the
 * in-app banner. Checked often while the app is on screen (never in the background); a push
 * arriving while it's open refreshes it at once.
 */
export const myChatUnreadQuery = queryOptions({
  queryKey: ['me', 'chat', 'unread'],
  queryFn: () => api<ChatUnread>('/me/chat/unread'),
  refetchInterval: 15_000,
})

/** Every client conversation a coach can open, with unread counts (admin). */
export const adminChatsQuery = queryOptions({
  queryKey: ['admin', 'chat'],
  queryFn: async () => (await api<{ chats: ChatSummary[] }>('/admin/chat')).chats,
  refetchInterval: 20_000,
})

/** Unread client messages across everyone you manage (the sidebar badge). */
export const adminChatUnreadQuery = queryOptions({
  queryKey: ['admin', 'chat', 'unread'],
  queryFn: async () => (await api<{ unread: number }>('/admin/chat/unread')).unread,
  refetchInterval: 60_000,
})

/** One client's conversation (admin). Polled while it's open. */
export const adminThreadQuery = (clientId: number) =>
  queryOptions({
    queryKey: ['admin', 'chat', 'thread', clientId],
    queryFn: () =>
      api<{ thread: ChatThread; client: { id: number; name: string } }>(`/admin/chat/${clientId}`),
    refetchInterval: 5_000,
  })

/** Your coach's likes and comments you haven't seen yet (phone app notifications). */
export const myFeedbackQuery = queryOptions({
  queryKey: ['me', 'feedback'],
  queryFn: async () => (await api<{ feedback: FeedbackNews[] }>('/me/feedback')).feedback,
  refetchInterval: 120_000,
})

/** Your coach's likes and comments on one of your workouts. */
export const sessionFeedbackQuery = (sessionId: number) =>
  queryOptions({
    queryKey: ['sessions', sessionId, 'feedback'],
    queryFn: async () =>
      (await api<{ feedback: SessionFeedback[] }>(`/sessions/${sessionId}/feedback`)).feedback,
  })

/** When someone was last seen, time in the app this week, and their signed-in devices (admin). */
export const personActivityQuery = (userId: number) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'activity'],
    queryFn: async () =>
      (await api<{ activity: PersonActivity }>(`/admin/users/${userId}/activity`)).activity,
    // Keep "Active now" honest while the page is open.
    refetchInterval: 60_000,
  })

/** A client's contact, body basics and goals (admin). */
export const clientProfileQuery = (userId: number) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'profile'],
    queryFn: async () =>
      (await api<{ profile: ClientProfile }>(`/admin/users/${userId}/profile`)).profile,
  })

/** On your own (no coach): ready-made programs you can start (app). */
export const starterProgramsQuery = queryOptions({
  queryKey: ['me', 'starter-programs'],
  queryFn: async () => (await api<{ programs: StarterProgram[] }>('/me/starter-programs')).programs,
})

/** Platform admin: everyone at a glance, sign-ups per week, and every business. */
export const platformPeopleQuery = queryOptions({
  queryKey: ['platform', 'people'],
  queryFn: async () => (await api<{ people: PlatformPeople }>('/platform/people')).people,
})

/** Platform admin: which business is the starter library, and every business's counts. */
export const platformStarterQuery = queryOptions({
  queryKey: ['platform', 'starter'],
  queryFn: async () => (await api<{ starter: StarterLibrary }>('/platform/starter')).starter,
})

/** Your own goals and body basics (app). */
export const myProfileQuery = queryOptions({
  queryKey: ['me', 'profile'],
  queryFn: async () => (await api<{ profile: ClientProfile }>('/me/profile')).profile,
})

/** Owners only: everyone who can coach (owners and coaches). */
export const coachesQuery = queryOptions({
  queryKey: ['admin', 'coaches'],
  queryFn: async () =>
    (
      await api<{ coaches: Array<{ id: number; name: string; role: 'owner' | 'admin' }> }>(
        '/admin/users/coaches',
      )
    ).coaches,
})

/** One page of the People list (searched, sorted and paged on the server). */
export const peopleQuery = (params: {
  view: 'me' | 'mine' | 'clients' | 'team'
  q: string
  sort: 'added' | 'seen' | 'name'
  page: number
}) =>
  queryOptions({
    queryKey: ['admin', 'users', 'directory', params],
    queryFn: () =>
      api<PeoplePage>(
        `/admin/users/directory?${new URLSearchParams({ ...params, page: String(params.page) })}`,
      ),
  })

export const usersQuery = queryOptions({
  queryKey: ['admin', 'users'],
  queryFn: async () => (await api<{ users: UserSummary[] }>('/admin/users')).users,
})

export interface PlanResponse {
  plan: MyPlan | null
  activeSession: { id: number; workoutName: string | null; startedAt: string } | null
  /** May build their own quick workout (staff always; clients when their coach allows it). */
  quickWorkouts: boolean
}

export const planQuery = queryOptions({
  queryKey: ['plan'],
  queryFn: () => api<PlanResponse>('/me/plan'),
})

export const statsQuery = (weeks = 8) =>
  queryOptions({
    queryKey: ['stats', weeks],
    queryFn: async () => (await api<{ stats: MyStats }>(`/me/stats?weeks=${weeks}`)).stats,
  })

export const sessionQuery = (id: number) =>
  queryOptions({
    queryKey: ['sessions', id],
    queryFn: async () => (await api<{ session: SessionDetail }>(`/sessions/${id}`)).session,
    staleTime: Number.POSITIVE_INFINITY,
  })

/** For swapping an exercise mid-workout: loaded when a workout opens, so it works with poor signal. */
export const swapOptionsQuery = queryOptions({
  queryKey: ['swap-options'],
  queryFn: () => api<SwapOptions>('/sessions/swap-options'),
  staleTime: 10 * 60_000,
})

/** The quick-workout builder: your own workouts to start from (exercises: swapOptionsQuery). */
export const quickWorkoutOptionsQuery = queryOptions({
  queryKey: ['quick-workouts'],
  queryFn: () => api<QuickWorkoutOptions>('/sessions/quick'),
  staleTime: 5 * 60_000,
})

/** A coach's suggested swaps for one exercise (admin). */
export const exerciseAlternativesQuery = (exerciseId: number) =>
  queryOptions({
    queryKey: ['exercises', exerciseId, 'alternatives'],
    queryFn: async () =>
      (await api<{ alternativeIds: number[] }>(`/exercises/${exerciseId}/alternatives`))
        .alternativeIds,
  })

/** The admin home page's numbers. */
export const adminOverviewQuery = queryOptions({
  queryKey: ['admin', 'overview'],
  queryFn: async () => (await api<{ overview: AdminOverview }>('/admin/overview')).overview,
  refetchInterval: 60_000,
})

/** "How to" videos for one exercise (YouTube, cached on the server). */
export const exerciseVideosQuery = (exerciseId: number) =>
  queryOptions({
    queryKey: ['videos', exerciseId],
    queryFn: () => api<VideoSearch>(`/videos?exerciseId=${exerciseId}`),
    staleTime: 60 * 60_000,
  })

/** Can this site estimate food from photos? (Phone app; the button hides when it can't.) */
export const foodSetupQuery = queryOptions({
  queryKey: ['food', 'setup'],
  queryFn: () => api<FoodSetup>('/me/food/setup'),
  // An owner can switch photos off: notice within a few minutes.
  staleTime: 5 * 60_000,
})

/** Your food for one day, with totals and your coach's targets (phone app). */
export const foodDayQuery = (date: string) =>
  queryOptions({
    queryKey: ['food', 'day', date],
    queryFn: async () => (await api<{ day: FoodDay }>(`/me/food?date=${date}`)).day,
  })

/** Your water for one day: what you drank and your daily goal (phone app). */
export const waterDayQuery = (date: string) =>
  queryOptions({
    queryKey: ['water', 'day', date],
    queryFn: async () => (await api<{ water: WaterDay }>(`/me/water?date=${date}`)).water,
  })

/** A client's water for one day and their goal (admin Food card). */
export const personWaterQuery = (userId: number, date?: string) =>
  queryOptions({
    queryKey: ['admin', 'water', userId, 'day', date ?? 'today'],
    queryFn: async () =>
      (await api<{ water: WaterDay }>(`/admin/users/${userId}/water${date ? `?date=${date}` : ''}`))
        .water,
  })

/** A client's water per day over a range (admin Food card). */
export const personWaterSummaryQuery = (userId: number, from: string, to: string) =>
  queryOptions({
    queryKey: ['admin', 'water', userId, 'summary', from, to],
    queryFn: () =>
      api<{ summary: WaterSummary; today: string }>(
        `/admin/users/${userId}/water/summary?from=${from}&to=${to}`,
      ),
  })

/** Your totals per day over a range (the Fuel week strip). */
export const foodSummaryQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ['food', 'summary', from, to],
    queryFn: async () =>
      (await api<{ summary: FoodSummary }>(`/me/food/summary?from=${from}&to=${to}`)).summary,
  })

/** Days in a row with food logged (phone app). */
export const foodStreakQuery = queryOptions({
  queryKey: ['food', 'streak'],
  queryFn: async () => (await api<{ days: number }>('/me/food/streak')).days,
})

/** Your saved meals ("My meals"). */
export const savedMealsQuery = queryOptions({
  queryKey: ['food', 'meals'],
  queryFn: async () => (await api<{ meals: SavedMeal[] }>('/me/food/meals')).meals,
  staleTime: 5 * 60_000,
})

/** Whether the evening food reminder is on (Profile). */
export const foodRemindersQuery = queryOptions({
  queryKey: ['food', 'reminders'],
  queryFn: async () => (await api<{ on: boolean }>('/me/food/reminders')).on,
  staleTime: 5 * 60_000,
})

/** Foods you logged lately, to add again quickly. */
export const foodRecentQuery = queryOptions({
  queryKey: ['food', 'recent'],
  queryFn: async () => (await api<{ foods: RecentFood[] }>('/me/food/recent')).foods,
})

/** Foods by name from the food databases, values per 100 g (phone app). */
export const foodSearchQuery = (q: string) =>
  queryOptions({
    queryKey: ['food', 'search', q.trim().toLowerCase()],
    queryFn: async () =>
      (
        await api<{ results: FoodSearchResult[] }>(
          `/me/food/search?q=${encodeURIComponent(q.trim())}`,
        )
      ).results,
    // The server keeps searches for a week; an hour on the phone is plenty.
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

/** A client's food for one day (admin). */
export const personFoodDayQuery = (userId: number, date: string) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'food', 'day', date],
    queryFn: async () =>
      (await api<{ day: FoodDay }>(`/admin/users/${userId}/food?date=${date}`)).day,
  })

/** A client's totals per day over a range, and their today (admin). */
export const personFoodSummaryQuery = (userId: number, from: string, to: string) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'food', 'summary', from, to],
    queryFn: () =>
      api<{ summary: FoodSummary; today: string }>(
        `/admin/users/${userId}/food/summary?from=${from}&to=${to}`,
      ),
  })

/** The owner's switch for food photo estimates, and whether the site has a Claude key (admin). */
/** A client's daily photo limit and today's use (admin). */
/** Whether a client may build their own quick workouts (admin). */
export const personQuickWorkoutsQuery = (userId: number) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'quick-workouts'],
    queryFn: async () =>
      (await api<{ quickWorkouts: QuickWorkoutsAccess }>(`/admin/users/${userId}/quick-workouts`))
        .quickWorkouts,
  })

export const personPhotoLimitQuery = (userId: number) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'food', 'photo-limit'],
    queryFn: async () =>
      (await api<{ photoLimit: PhotoLimit }>(`/admin/users/${userId}/food/photo-limit`)).photoLimit,
  })

export const foodPhotoSettingsQuery = queryOptions({
  queryKey: ['admin', 'settings', 'food-photos'],
  queryFn: async () =>
    (await api<{ foodPhotos: FoodPhotoSettings }>('/admin/settings/food-photos')).foodPhotos,
})

/** The owner's switch for "Build with Claude", and whether the site has a Claude key (admin). */
export const workoutBuilderSettingsQuery = queryOptions({
  queryKey: ['admin', 'settings', 'workout-builder'],
  queryFn: async () =>
    (await api<{ workoutBuilder: ClaudeFeatureSettings }>('/admin/settings/workout-builder'))
      .workoutBuilder,
})

/** Is the "Build with Claude" button shown on Workouts? */
export const workoutBuilderQuery = queryOptions({
  queryKey: ['admin', 'workout-builder'],
  queryFn: () => api<{ available: boolean }>('/workout-builder'),
  staleTime: 5 * 60_000,
})

/** Is "Build with Claude" for programs shown? (its own switch and daily limit). */
export const programBuilderQuery = queryOptions({
  queryKey: ['admin', 'program-builder'],
  queryFn: () => api<{ available: boolean }>('/program-builder'),
})

/** Platform admin: every Claude feature's switch, model and hard daily limit. */
export const platformClaudeQuery = queryOptions({
  queryKey: ['platform', 'claude'],
  queryFn: async () => (await api<{ claude: ClaudeConfig }>('/platform/claude')).claude,
})

/** Platform admin: what Claude costs (this month, last month, 30 days, top users, failures). */
export const platformCostsQuery = queryOptions({
  queryKey: ['platform', 'costs'],
  queryFn: async () => (await api<{ costs: ClaudeCosts }>('/platform/costs')).costs,
})

/** Platform admin: every coach and owner, their clients and this month's Claude spend. */
export const platformCoachesQuery = queryOptions({
  queryKey: ['platform', 'coaches'],
  queryFn: async () => (await api<{ coaches: PlatformCoach[] }>('/platform/coaches')).coaches,
})

/** Platform admin: which keys this site has, and the newest migration. */
export const platformHealthQuery = queryOptions({
  queryKey: ['platform', 'health'],
  queryFn: async () => (await api<{ health: PlatformHealth }>('/platform/health')).health,
})

/** The query string for a page of recipes; empty values left out. */
function recipeSearch(params: RecipeListQuery): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const text = q.toString()
  return text ? `?${text}` : ''
}

/**
 * A page of recipes (staff: archived: '1' for archived ones) with the counts for each chip,
 * and whether you saved each. The last page stays on screen while the next one loads.
 */
export const recipePageQuery = (params: RecipeListQuery) =>
  queryOptions({
    queryKey: ['recipes', 'page', params],
    queryFn: () => api<RecipePage>(`/recipes${recipeSearch(params)}`),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  })

export const recipeQuery = (id: number) =>
  queryOptions({
    queryKey: ['recipes', id],
    queryFn: async () => (await api<{ recipe: Recipe }>(`/recipes/${id}`)).recipe,
    staleTime: 5 * 60_000,
  })

/**
 * Puts a recipe the server just sent back into the cache: the recipe itself, and its card on
 * any page already loaded. The pages refresh in the background (a recipe may move pages).
 */
export function putRecipe(queryClient: QueryClient, recipe: Recipe) {
  queryClient.setQueryData(recipeQuery(recipe.id).queryKey, recipe)
  queryClient.setQueriesData<RecipePage>({ queryKey: ['recipes', 'page'] }, (page) =>
    page ? { ...page, recipes: page.recipes.map((r) => (r.id === recipe.id ? recipe : r)) } : page,
  )
  void queryClient.invalidateQueries({ queryKey: ['recipes', 'page'] })
}

/** Invitations waiting for the signed-in person (only when they train on their own). */
export const myInvitationsQuery = queryOptions({
  queryKey: ['me', 'invitations'],
  queryFn: async () =>
    (await api<{ invitations: InvitationForMe[] }>('/me/invitations')).invitations,
})

/** Staff: pending invitations (owners: the whole business; coaches: their own). */
export const invitationsQuery = queryOptions({
  queryKey: ['invitations'],
  queryFn: async () => (await api<{ invitations: Invitation[] }>('/admin/invitations')).invitations,
})

/** Staff: a new coach's first steps on Today. */
export const firstStepsQuery = queryOptions({
  queryKey: ['overview', 'first-steps'],
  queryFn: async () => (await api<{ steps: CoachFirstSteps }>('/admin/overview/first-steps')).steps,
})

/** Platform admin: who did what, newest first (pass the last page's nextBefore for more). */
export const platformAuditQuery = (before: number | null = null) =>
  queryOptions({
    queryKey: ['platform', 'audit', before],
    queryFn: async () =>
      (await api<{ audit: AuditPage }>(`/platform/audit${before ? `?before=${before}` : ''}`))
        .audit,
  })

/** Platform admin: errors in the last day and hour, and the latest ones. */
export const platformErrorsQuery = queryOptions({
  queryKey: ['platform', 'errors'],
  queryFn: async () => (await api<{ errors: ErrorSummary }>('/platform/errors')).errors,
})

/** Platform admin: every try to sign in (app and admin), with filters and paging. */
export const platformSignInsQuery = (filters: {
  app: 'all' | 'app' | 'admin'
  failed: boolean
  q: string
  before: number | null
}) =>
  queryOptions({
    queryKey: ['platform', 'sign-ins', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.app !== 'all') params.set('app', filters.app)
      if (filters.failed) params.set('failed', '1')
      if (filters.q) params.set('q', filters.q)
      if (filters.before) params.set('before', String(filters.before))
      const qs = params.toString()
      return (await api<{ signIns: SignInSummary }>(`/platform/sign-ins${qs ? `?${qs}` : ''}`))
        .signIns
    },
  })

/** Platform admin: every table's row count and the database size. */
export const platformDatabaseQuery = queryOptions({
  queryKey: ['platform', 'database'],
  queryFn: async () => (await api<{ database: DatabaseSummary }>('/platform/database')).database,
})
