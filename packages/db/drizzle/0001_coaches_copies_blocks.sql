ALTER TABLE `users` ADD `coach_id` integer REFERENCES users(id) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `users_coach_idx` ON `users` (`coach_id`);
--> statement-breakpoint
ALTER TABLE `workouts` ADD `client_id` integer REFERENCES users(id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `workouts` ADD `source_workout_id` integer;
--> statement-breakpoint
CREATE INDEX `workouts_client_idx` ON `workouts` (`client_id`);
--> statement-breakpoint
ALTER TABLE `programs` ADD `client_id` integer REFERENCES users(id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `programs` ADD `source_program_id` integer;
--> statement-breakpoint
CREATE INDEX `programs_client_idx` ON `programs` (`client_id`);
--> statement-breakpoint
CREATE TABLE `workout_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_id` integer NOT NULL,
	`group_number` integer NOT NULL,
	`kind` text DEFAULT 'superset' NOT NULL,
	`rounds` integer DEFAULT 3 NOT NULL,
	`work_seconds` integer,
	`rest_seconds` integer,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_groups_slot_uq` ON `workout_groups` (`workout_id`,`group_number`);
--> statement-breakpoint
CREATE TABLE `session_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`position` integer NOT NULL,
	`target_sets` integer NOT NULL,
	`target_reps_min` integer,
	`target_reps_max` integer,
	`target_seconds` integer,
	`rest_seconds` integer NOT NULL,
	`superset_group` integer,
	`group_kind` text,
	`group_rounds` integer,
	`group_work_seconds` integer,
	`group_rest_seconds` integer,
	`notes` text,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_exercises_session_idx` ON `session_exercises` (`session_id`,`position`);
--> statement-breakpoint
-- Everyone who was an admin could see everybody; keep that by making them owners.
UPDATE `users` SET `role` = 'owner' WHERE `role` = 'admin';
