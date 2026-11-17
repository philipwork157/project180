ALTER TABLE `recipes` ADD `category` text DEFAULT 'meal' NOT NULL;--> statement-breakpoint
CREATE INDEX `recipes_archived_category_title_idx` ON `recipes` (`archived_at`,`category`,`title`);