import { describe, expect, it } from 'vitest'
import { feedbackNotifications } from './feedback'
import type { FeedbackNews } from './types'

const news = (over: Partial<FeedbackNews> = {}): FeedbackNews => ({
  id: 1,
  sessionId: 10,
  exerciseId: 3,
  kind: 'like',
  body: null,
  authorId: 2,
  authorName: 'Kim Botha',
  createdAt: '2026-11-13T06:00:00.000Z',
  readAt: null,
  workoutName: 'Legs',
  exerciseName: 'Back Squat',
  ...over,
})

describe('feedbackNotifications', () => {
  it('says exactly what a single like or comment was', () => {
    expect(feedbackNotifications([news()])).toEqual([
      {
        id: 'feedback:10:1',
        kind: 'feedback',
        sessionId: 10,
        title: 'Kim liked your Back Squat',
        body: 'On Legs. Tap to see it.',
      },
    ])
    const [comment] = feedbackNotifications([
      news({ kind: 'comment', body: 'Great depth!', exerciseId: null, exerciseName: null }),
    ])
    expect(comment).toMatchObject({ title: 'Kim commented on your Legs', body: 'Great depth!' })
  })

  it('sums up several on one workout, one notification per workout', () => {
    const list = feedbackNotifications([
      news({ id: 5, kind: 'comment', body: 'Strong today' }),
      news({ id: 4 }),
      news({ id: 3, exerciseId: 4, exerciseName: 'Lunge' }),
      news({ id: 2, sessionId: 11, authorName: null, exerciseId: null, exerciseName: null }),
    ])
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      id: 'feedback:10:5',
      sessionId: 10,
      title: 'Kim left feedback on Legs',
      body: '“Strong today” · 2 likes · 1 comment',
    })
    expect(list[1]).toMatchObject({ title: 'Your coach liked your Legs', sessionId: 11 })
  })

  it('is empty with nothing unread', () => {
    expect(feedbackNotifications([])).toEqual([])
  })
})
