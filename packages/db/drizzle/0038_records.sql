CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer,
	`actor_id` integer,
	`actor_name` text,
	`action` text NOT NULL,
	`target_id` integer,
	`target_name` text,
	`detail` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_business_created_idx` ON `audit_events` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_events_target_idx` ON `audit_events` (`target_id`);--> statement-breakpoint
CREATE TABLE `error_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`where` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `error_events_created_idx` ON `error_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`coach_id` integer NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_user_id` integer,
	`answered_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_business_status_idx` ON `invitations` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `invitations_email_status_idx` ON `invitations` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `invitations_coach_idx` ON `invitations` (`coach_id`);--> statement-breakpoint
CREATE INDEX `invitations_accepted_user_idx` ON `invitations` (`accepted_user_id`);