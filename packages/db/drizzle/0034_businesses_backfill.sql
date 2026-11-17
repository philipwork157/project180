-- Custom SQL migration file, put your code below! --
-- Moves the one gym that existed before businesses into the first business, untouched:
-- everyone but the platform admin, and every exercise and recipe (so all of it stays editable
-- and private to it). Its default photo limit moves from the site setting to the business.
-- Safe on a new, empty database: no people means no business is made and nothing changes.
INSERT INTO `businesses` (`name`, `food_photos_per_day`, `created_at`, `updated_at`)
SELECT
	'Project 180',
	(SELECT CAST(`value` AS INTEGER) FROM `app_settings` WHERE `key` = 'food_photos_per_day'),
	CAST(strftime('%s', 'now') AS INTEGER) * 1000,
	CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM `users` WHERE `role` <> 'platform')
	AND NOT EXISTS (SELECT 1 FROM `businesses`);
--> statement-breakpoint
UPDATE `users` SET `business_id` = (SELECT min(`id`) FROM `businesses`)
WHERE `role` <> 'platform' AND `business_id` IS NULL;
--> statement-breakpoint
UPDATE `exercises` SET `business_id` = (SELECT min(`id`) FROM `businesses`)
WHERE `business_id` IS NULL;
--> statement-breakpoint
UPDATE `recipes` SET `business_id` = (SELECT min(`id`) FROM `businesses`)
WHERE `business_id` IS NULL;
