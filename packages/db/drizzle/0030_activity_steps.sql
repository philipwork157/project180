CREATE TABLE `activity_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_uuid` text NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`minutes` integer NOT NULL,
	`kcal` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_logs_client_uuid_unique` ON `activity_logs` (`client_uuid`);--> statement-breakpoint
CREATE INDEX `activity_logs_user_date_idx` ON `activity_logs` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `step_logs` (
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`steps` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `step_logs_user_date_uq` ON `step_logs` (`user_id`,`date`);