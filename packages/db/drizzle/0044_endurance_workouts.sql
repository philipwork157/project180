ALTER TABLE `workout_exercises` ADD `target_power_pct` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_cadence` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_rpe` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_elevation_m` integer;--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `target_power_pct` integer;--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `target_cadence` integer;--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `target_rpe` integer;--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `target_elevation_m` integer;--> statement-breakpoint
ALTER TABLE `set_logs` ADD `avg_hr` integer;--> statement-breakpoint
ALTER TABLE `set_logs` ADD `avg_watts` integer;--> statement-breakpoint
ALTER TABLE `set_logs` ADD `elevation_m` integer;