ALTER TABLE `invitations` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `invitations_user_idx` ON `invitations` (`user_id`);