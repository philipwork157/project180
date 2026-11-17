// A business is one coach's or one gym's own space: its owner, coaches, clients and library.
// Owners and coaches only ever see their own business; the platform admin sees none of their
// data. A gym with several coaches is one business; a coach on their own is a business of one.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createdAt, id, updatedAt } from './columns'

export const businesses = sqliteTable('businesses', {
  id: id(),
  name: text('name').notNull(),
  // Food photos a day for its clients without their own number; null = the built-in default.
  foodPhotosPerDay: integer('food_photos_per_day'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
