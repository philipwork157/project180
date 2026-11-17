CREATE TABLE `claude_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`feature` text NOT NULL,
	`model` text NOT NULL,
	`outcome` text NOT NULL,
	`fail_reason` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer,
	`duration_ms` integer,
	`kind` text,
	`items` integer,
	`had_note` integer,
	`request_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `claude_calls_created_idx` ON `claude_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `claude_calls_user_feature_created_idx` ON `claude_calls` (`user_id`,`feature`,`created_at`);