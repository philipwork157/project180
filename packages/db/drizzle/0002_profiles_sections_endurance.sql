ALTER TABLE `exercises` ADD `category` text DEFAULT 'strength' NOT NULL;
--> statement-breakpoint
UPDATE `exercises` SET `category` = 'cardio' WHERE `muscle_group` = 'cardio';
--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `section` text DEFAULT 'main' NOT NULL;
--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_distance_m` real;
--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_pace_seconds` integer;
--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_hr_zone` integer;
--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `section` text DEFAULT 'main' NOT NULL;
--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `target_distance_m` real;
--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `target_pace_seconds` integer;
--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `target_hr_zone` integer;
--> statement-breakpoint
CREATE TABLE `client_profiles` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`phone` text,
	`birth_date` text,
	`sex` text,
	`height_cm` real,
	`goal_weight_kg` real,
	`main_goal` text,
	`focus_areas` text DEFAULT '[]' NOT NULL,
	`places` text DEFAULT '[]' NOT NULL,
	`experience` text,
	`days_per_week` integer,
	`target_event` text,
	`target_event_date` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
