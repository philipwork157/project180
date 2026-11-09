ALTER TABLE `exercises` ADD `keywords` text;
--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_reps_per_set` text;
--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `bodyweight` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `target_reps_per_set` text;
--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `bodyweight` integer DEFAULT false NOT NULL;
