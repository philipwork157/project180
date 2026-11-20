CREATE TABLE `check_in_answers` (
	`check_in_id` integer PRIMARY KEY NOT NULL,
	`week` integer NOT NULL,
	`sleep` integer NOT NULL,
	`stress` integer NOT NULL,
	`hunger` integer NOT NULL,
	`wins` text,
	`struggles` text,
	`notes` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`check_in_id`) REFERENCES `check_ins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `check_ins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`coach_id` integer,
	`due_date` text NOT NULL,
	`repeat_weeks` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`coach_notes` text,
	`done_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `check_ins_client_status_due_idx` ON `check_ins` (`client_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `check_ins_coach_idx` ON `check_ins` (`coach_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `check_ins_one_scheduled_uq` ON `check_ins` (`client_id`) WHERE "check_ins"."status" = 'scheduled';--> statement-breakpoint
ALTER TABLE `client_profiles` ADD `body_goal` text;