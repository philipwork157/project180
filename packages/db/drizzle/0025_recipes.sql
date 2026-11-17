CREATE TABLE `recipe_saves` (
	`user_id` integer NOT NULL,
	`recipe_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_saves_user_recipe_uq` ON `recipe_saves` (`user_id`,`recipe_id`);--> statement-breakpoint
CREATE INDEX `recipe_saves_recipe_idx` ON `recipe_saves` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`meal` text NOT NULL,
	`servings` integer NOT NULL,
	`prep_minutes` integer DEFAULT 0 NOT NULL,
	`cook_minutes` integer DEFAULT 0 NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real,
	`fat_g` real,
	`ingredients` text NOT NULL,
	`steps` text NOT NULL,
	`tips` text,
	`source_name` text,
	`source_url` text,
	`created_by` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recipes_created_by_idx` ON `recipes` (`created_by`);--> statement-breakpoint
CREATE INDEX `recipes_archived_title_idx` ON `recipes` (`archived_at`,`title`);