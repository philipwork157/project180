ALTER TABLE `users` ADD `must_change_password` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` integer;
--> statement-breakpoint
CREATE TABLE `app_activity` (
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_activity_user_date_uq` ON `app_activity` (`user_id`,`date`);
--> statement-breakpoint
CREATE TABLE `sign_in_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`first_at` integer NOT NULL,
	`locked_until` integer
);
