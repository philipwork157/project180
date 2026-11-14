CREATE TABLE `food_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_uuid` text NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`meal` text NOT NULL,
	`name` text NOT NULL,
	`grams` real,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real,
	`fat_g` real,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `food_entries_client_uuid_unique` ON `food_entries` (`client_uuid`);--> statement-breakpoint
CREATE INDEX `food_entries_user_date_idx` ON `food_entries` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `food_photo_uses` (
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `food_photo_uses_user_date_uq` ON `food_photo_uses` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `nutrition_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`kcal` integer NOT NULL,
	`protein_g` integer NOT NULL,
	`carbs_g` integer,
	`fat_g` integer,
	`set_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_targets_user_uq` ON `nutrition_targets` (`user_id`);--> statement-breakpoint
CREATE INDEX `nutrition_targets_set_by_idx` ON `nutrition_targets` (`set_by`);