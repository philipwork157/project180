CREATE TABLE `water_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_uuid` text NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`ml` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `water_logs_client_uuid_unique` ON `water_logs` (`client_uuid`);--> statement-breakpoint
CREATE INDEX `water_logs_user_date_idx` ON `water_logs` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `users` ADD `water_goal_ml` integer;