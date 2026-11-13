CREATE TABLE `session_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_id` integer,
	`author_id` integer,
	`kind` text NOT NULL,
	`body` text,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `session_feedback_session_idx` ON `session_feedback` (`session_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `session_feedback_exercise_idx` ON `session_feedback` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `session_feedback_author_idx` ON `session_feedback` (`author_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_feedback_exercise_like_uq` ON `session_feedback` (`session_id`,`author_id`,`exercise_id`) WHERE "session_feedback"."kind" = 'like' and "session_feedback"."exercise_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `session_feedback_workout_like_uq` ON `session_feedback` (`session_id`,`author_id`) WHERE "session_feedback"."kind" = 'like' and "session_feedback"."exercise_id" is null;