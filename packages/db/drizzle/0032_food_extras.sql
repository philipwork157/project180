CREATE TABLE `saved_meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`items` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_meals_user_idx` ON `saved_meals` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `food_reminders` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `food_entries` ADD `fibre_g` real;--> statement-breakpoint
ALTER TABLE `food_entries` ADD `sugar_g` real;--> statement-breakpoint
ALTER TABLE `food_entries` ADD `sodium_mg` real;--> statement-breakpoint
ALTER TABLE `food_products` ADD `fibre_g` real;--> statement-breakpoint
ALTER TABLE `food_products` ADD `sugar_g` real;--> statement-breakpoint
ALTER TABLE `food_products` ADD `sodium_mg` real;