CREATE TABLE `video_searches` (
	`exercise_id` integer PRIMARY KEY NOT NULL,
	`results` text NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
