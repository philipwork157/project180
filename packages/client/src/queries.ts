import type {
  AdminOverview,
  ChatSummary,
  ChatThread,
  ChatUnread,
  ClientProfile,
  EnrollmentSummary,
  Exercise,
  FeedbackNews,
  FoodDay,
  FoodPhotoSettings,
  FoodSetup,
  FoodSummary,
  Me,
  MyPlan,
  MyStats,
  PeoplePage,
  PersonActivity,
  PersonPrograms,
  PersonStats,
  PhotoLimit,
  ProgramCopySummary,
  ProgramDetail,
  ProgramSummary,
  RecentFood,
  SessionDetail,
  SessionFeedback,
  SwapOptions,
  UserSummary,
  VideoSearch,
  WorkoutDetail,
  WorkoutSummary,
} from '@project180/shared'
import { type QueryClient, queryOptions } from '@tanstack/react-query'
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

/** Your totals per day over a range (the Fuel week strip). */
export const foodSummaryQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ['food', 'summary', from, to],
    queryFn: async () =>
      (await api<{ summary: FoodSummary }>(`/me/food/summary?from=${from}&to=${to}`)).summary,
  })

/** Foods you logged lately, to add again quickly. */
export const foodRecentQuery = queryOptions({
  queryKey: ['food', 'recent'],
  queryFn: async () => (await api<{ foods: RecentFood[] }>('/me/food/recent')).foods,
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
export const personPhotoLimitQuery = (userId: number) =>
  queryOptions({
    queryKey: ['admin', 'users', userId, 'food', 'photo-limit'],
    queryFn: async () =>
      (await api<{ photoLimit: PhotoLimit }>(`/admin/users/${userId}/food/photo-limit`))
        .photoLimit,
  })

export const foodPhotoSettingsQuery = queryOptions({
  queryKey: ['admin', 'settings', 'food-photos'],
  queryFn: async () =>
    (await api<{ foodPhotos: FoodPhotoSettings }>('/admin/settings/food-photos')).foodPhotos,
})
