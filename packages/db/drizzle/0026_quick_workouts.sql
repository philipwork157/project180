ALTER TABLE `users` ADD `quick_workouts` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workouts` ADD `quick` integer DEFAULT false NOT NULL;