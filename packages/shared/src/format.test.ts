import { describe, expect, it } from 'vitest'
import {
  deviceLabel,
  durationShort,
  exercisePhotos,
  exerciseVideoSearchUrl,
  isActiveNow,
  matchesExercise,
  repsLabel,
  timeAgo,
  youtubeId,
} from './format'

describe('deviceLabel', () => {
  it('names common phones and computers', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone · Safari')
    expect(
      deviceLabel(
        'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      ),
    ).toBe('Android phone · Chrome')
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
      ),
    ).toBe('Windows · Edge')
    expect(deviceLabel(null)).toBe('Unknown device')
  })
})

describe('timeAgo and durationShort', () => {
  const now = new Date('2026-11-09T12:00:00Z')
  it('reads like a person would say it', () => {
    expect(timeAgo('2026-11-09T11:59:30Z', now)).toBe('Just now')
    expect(timeAgo('2026-11-09T11:40:00Z', now)).toBe('20 min ago')
    expect(timeAgo('2026-11-08T10:00:00Z', now)).toBe('Yesterday')
    expect(timeAgo(null, now)).toBe('Never')
    expect(durationShort(40 * 60)).toBe('40 m')
    expect(durationShort(85 * 60)).toBe('1 h 25 m')
  })
})

describe('matchesExercise and repsLabel', () => {
  it('finds exercises by their other names and muscles', () => {
    const curl = {
      name: 'Seated Leg Curl',
      keywords: 'seated hamstring curl, hamstrings',
      muscleGroup: 'legs',
    }
    expect(matchesExercise(curl, 'hamstrings')).toBe(true)
    expect(matchesExercise(curl, 'seated hamstring')).toBe(true)
    expect(matchesExercise(curl, 'pelvic')).toBe(false)
    expect(matchesExercise(curl, '')).toBe(true)
  })

  it('writes reps set by set or as a range', () => {
    expect(
      repsLabel({ targetRepsPerSet: [12, 10, 10, 8], targetRepsMin: 8, targetRepsMax: 12 }),
    ).toBe('12 · 10 · 10 · 8')
    expect(repsLabel({ targetRepsMin: 8, targetRepsMax: 12 })).toBe('8–12')
    expect(repsLabel({ targetRepsMin: 10, targetRepsMax: 10 })).toBe('10')
    expect(repsLabel({ targetRepsMin: null, targetRepsMax: null })).toBe('max')
  })
})

describe('exercisePhotos', () => {
  it('gives the start and finish photo, or nothing', () => {
    expect(exercisePhotos('exercise-images/Barbell_Squat')).toEqual([
      '/exercise-images/Barbell_Squat/0.webp',
      '/exercise-images/Barbell_Squat/1.webp',
    ])
    expect(exercisePhotos('exercise-images/Barbell_Squat', 'https://app.test/')[0]).toBe(
      'https://app.test/exercise-images/Barbell_Squat/0.webp',
    )
    expect(exercisePhotos(null)).toEqual([])
  })
})

describe('exerciseVideoSearchUrl', () => {
  it('searches YouTube for how to do the exercise', () => {
    expect(exerciseVideoSearchUrl('90/90 Hip Stretch')).toBe(
      'https://www.youtube.com/results?search_query=how%20to%20do%2090%2F90%20Hip%20Stretch%20exercise%20proper%20form',
    )
    expect(exerciseVideoSearchUrl('Heel Slide', 'pelvic_floor')).toContain(
      'pelvic%20floor%20physio',
    )
  })
})

describe('youtubeId', () => {
  it('reads the id from any YouTube link', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=abc123XYZ_-')).toBe('abc123XYZ_-')
    expect(youtubeId('https://youtu.be/abc123XYZ_-?t=5')).toBe('abc123XYZ_-')
    expect(youtubeId('https://youtube.com/shorts/abc123XYZ_-')).toBe('abc123XYZ_-')
    expect(youtubeId('https://vimeo.com/123')).toBeNull()
    expect(youtubeId('not a url')).toBeNull()
  })
})

describe('isActiveNow', () => {
  const now = Date.parse('2026-11-14T21:00:00Z')
  it('is seen in the last 5 minutes and still signed in', () => {
    expect(isActiveNow('2026-11-14T20:58:00Z', true, now)).toBe(true)
  })

  it('stops the moment they sign out, however recently they were seen', () => {
    expect(isActiveNow('2026-11-14T20:59:30Z', false, now)).toBe(false)
  })

  it('is false when not seen lately or never', () => {
    expect(isActiveNow('2026-11-14T20:50:00Z', true, now)).toBe(false)
    expect(isActiveNow(null, true, now)).toBe(false)
  })
})
