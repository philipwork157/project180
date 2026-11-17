import {
  type Db,
  exercises,
  sessionExercises,
  videoSearches,
  workoutExercises,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  exerciseVideoSearchUrl,
  isStaff,
  type Me,
  type VideoResult,
  type VideoSearch,
} from '@project180/shared'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { notFound } from '../errors'
import { inMyBusiness } from '../library'
import { requireUser } from '../middleware'

/** Results are shared by everyone and kept this long; a search costs 1% of the daily free quota. */
const KEEP_MS = 30 * 24 * 60 * 60 * 1000
const query = z.object({ exerciseId: z.coerce.number().int().positive() })

interface YouTubeSearch {
  items?: Array<{
    id?: { videoId?: string }
    snippet?: {
      title?: string
      channelTitle?: string
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } }
    }
  }>
}

/** YouTube titles come HTML-escaped. */
const decodeHtml = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

/**
 * "How to do this exercise" videos, searched on YouTube once per exercise and cached.
 * Without YOUTUBE_API_KEY it answers configured: false and the app opens YouTube instead.
 */
/**
 * Staff may look up any exercise in their business's library. A client only exercises in their
 * own workouts (their program copies, or a workout they've started, swaps included), so nobody
 * can walk through every id and use up the day's YouTube searches.
 */
async function mayWatch(db: Db, user: Me, exerciseId: number) {
  if (isStaff(user.role)) {
    const [row] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), inMyBusiness(exercises.businessId, user)))
    return Boolean(row)
  }
  const [[inProgram], [inSession]] = await Promise.all([
    db
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .where(and(eq(workoutExercises.exerciseId, exerciseId), eq(workouts.clientId, user.id)))
      .limit(1),
    db
      .select({ id: sessionExercises.id })
      .from(sessionExercises)
      .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
      .where(and(eq(sessionExercises.exerciseId, exerciseId), eq(workoutSessions.userId, user.id)))
      .limit(1),
  ])
  return Boolean(inProgram || inSession)
}

export const videoRoutes = new Hono<AppEnv>().use(requireUser).get('/', async (c) => {
  const { db } = c.var
  const parsed = query.safeParse({ exerciseId: c.req.query('exerciseId') })
  if (!parsed.success) notFound('Exercise not found')
  const id = parsed.data.exerciseId
  // 404 like any other "not yours", so ids reveal nothing.
  if (!(await mayWatch(db, c.var.user, id))) notFound('Exercise not found')
  const [exercise] = await db
    .select({ name: exercises.name, muscleGroup: exercises.muscleGroup })
    .from(exercises)
    .where(eq(exercises.id, id))
  if (!exercise) notFound('Exercise not found')
  const searchUrl = exerciseVideoSearchUrl(exercise.name, exercise.muscleGroup)
  const key = c.env.YOUTUBE_API_KEY
  if (!key) return c.json<VideoSearch>({ results: [], configured: false, searchUrl })

  const [cached] = await db.select().from(videoSearches).where(eq(videoSearches.exerciseId, id))
  if (cached && Date.now() - cached.fetchedAt.getTime() < KEEP_MS) {
    return c.json<VideoSearch>({ results: cached.results, configured: true, searchUrl })
  }

  const q = new URL(searchUrl).searchParams.get('search_query') ?? exercise.name
  const api = new URL('https://www.googleapis.com/youtube/v3/search')
  for (const [k, v] of Object.entries({
    part: 'snippet',
    type: 'video',
    maxResults: '6',
    videoEmbeddable: 'true',
    safeSearch: 'strict',
    relevanceLanguage: 'en',
    q,
    key,
  })) {
    api.searchParams.set(k, v)
  }
  const res = await fetch(api)
  if (!res.ok) {
    // Quota used up or a bad key: fall back to the cached results (even if old), or to YouTube itself.
    console.error('YouTube search failed', res.status)
    return c.json<VideoSearch>({ results: cached?.results ?? [], configured: true, searchUrl })
  }
  const data = (await res.json()) as YouTubeSearch
  const results: VideoResult[] = (data.items ?? [])
    .filter((i) => i.id?.videoId)
    .map((i) => ({
      videoId: i.id?.videoId ?? '',
      title: decodeHtml(i.snippet?.title ?? ''),
      channel: decodeHtml(i.snippet?.channelTitle ?? ''),
      thumbnail: i.snippet?.thumbnails?.medium?.url ?? i.snippet?.thumbnails?.default?.url ?? '',
    }))
  await db
    .insert(videoSearches)
    .values({ exerciseId: id, results, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: videoSearches.exerciseId,
      set: { results, fetchedAt: new Date() },
    })
  return c.json<VideoSearch>({ results, configured: true, searchUrl })
})
