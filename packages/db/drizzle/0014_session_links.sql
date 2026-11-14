ALTER TABLE `sessions` ADD `app` text;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `session_id` integer;--> statement-breakpoint
CREATE INDEX `push_subscriptions_session_idx` ON `push_subscriptions` (`session_id`);--> statement-breakpoint
CREATE INDEX `exercise_alternatives_alternative_idx` ON `exercise_alternatives` (`alternative_id`);--> statement-breakpoint
CREATE INDEX `exercise_alternatives_created_by_idx` ON `exercise_alternatives` (`created_by`);--> statement-breakpoint
CREATE INDEX `enrollments_assigned_by_idx` ON `enrollments` (`assigned_by`);--> statement-breakpoint
CREATE INDEX `workout_sessions_program_day_idx` ON `workout_sessions` (`program_day_id`);--> statement-breakpoint
-- Before the one-in-progress rule: close all but the newest workout in progress per person.
UPDATE `workout_sessions` SET `status` = 'abandoned' WHERE `status` = 'in_progress' AND `id` NOT IN (SELECT max(`id`) FROM `workout_sessions` WHERE `status` = 'in_progress' GROUP BY `user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workout_sessions_one_in_progress_uq` ON `workout_sessions` (`user_id`) WHERE "workout_sessions"."status" = 'in_progress';