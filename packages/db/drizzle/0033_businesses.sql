CREATE TABLE `businesses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`food_photos_per_day` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `business_id` integer REFERENCES businesses(id);--> statement-breakpoint
CREATE INDEX `users_business_role_idx` ON `users` (`business_id`,`role`);--> statement-breakpoint
ALTER TABLE `exercises` ADD `business_id` integer REFERENCES businesses(id);--> statement-breakpoint
CREATE INDEX `exercises_business_name_idx` ON `exercises` (`business_id`,`name`);--> statement-breakpoint
ALTER TABLE `recipes` ADD `business_id` integer REFERENCES businesses(id);--> statement-breakpoint
CREATE INDEX `recipes_business_idx` ON `recipes` (`business_id`);