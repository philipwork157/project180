import type {
  AdminOverview,
  ClientProfile,
  EnrollmentSummary,
  Exercise,
  Me,
  MyPlan,
  MyStats,
  PersonActivity,
  PersonPrograms,
  PersonStats,
  ProgramCopySummary,
  ProgramDetail,
  ProgramSummary,
  SessionDetail,
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
    isNew && list
      ? [...list, exercise].sort((a, b) => a.name.localeCompare(b.name))
      : swap(list),
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

export const enrollmentsQuery = (programId?: number) =>
  queryOptions({
    queryKey: ['enrollments', { programId }],
    queryFn: async () =>
      (
        await api<{ enrollments: EnrollmentSummary[] }>(
          `/enrollments${programId ? `?programId=${programId}` : ''}`,
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
