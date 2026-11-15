ALTER TABLE `enrollments` ADD `started_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollments_one_scheduled_per_day_uq` ON `enrollments` (`user_id`,`start_date`) WHERE "enrollments"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX `enrollments_status_start_idx` ON `enrollments` (`status`,`start_date`);