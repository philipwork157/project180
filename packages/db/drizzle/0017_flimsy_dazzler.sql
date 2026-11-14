CREATE TABLE `food_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barcode` text NOT NULL,
	`found` integer NOT NULL,
	`provider` text,
	`name` text,
	`brand` text,
	`kcal` real,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`serving_g` real,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `food_products_barcode_uq` ON `food_products` (`barcode`);