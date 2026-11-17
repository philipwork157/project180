CREATE TABLE `sign_in_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app` text NOT NULL,
	`email` text NOT NULL,
	`user_id` integer,
	`outcome` text NOT NULL,
	`ip` text,
	`country` text,
	`device` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sign_in_events_created_idx` ON `sign_in_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `sign_in_events_user_idx` ON `sign_in_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `sign_in_events_ip_created_idx` ON `sign_in_events` (`ip`,`created_at`);