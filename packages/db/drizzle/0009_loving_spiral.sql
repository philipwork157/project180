CREATE TABLE `exercise_alternatives` (
	`exercise_id` integer NOT NULL,
	`alternative_id` integer NOT NULL,
	`position` integer NOT NULL,
	`created_by` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`alternative_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_alternatives_pair_uq` ON `exercise_alternatives` (`exercise_id`,`alternative_id`);--> statement-breakpoint
CREATE INDEX `exercise_alternatives_exercise_idx` ON `exercise_alternatives` (`exercise_id`,`position`);--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `original_exercise_id` integer REFERENCES exercises(id);--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `swapped_at` integer;--> statement-breakpoint
CREATE INDEX `session_exercises_original_idx` ON `session_exercises` (`original_exercise_id`);