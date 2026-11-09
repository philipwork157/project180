import { twMerge } from 'tailwind-merge'

/**
 * Joins class names, skipping empty values. When two classes set the same
 * thing (px-4 vs px-0, w-full vs w-14), the later one wins, so a screen can
 * adjust a component without fighting its defaults.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(' '))
}
