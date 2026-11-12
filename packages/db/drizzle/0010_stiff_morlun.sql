DROP INDEX `set_logs_session_idx`;--> statement-breakpoint
CREATE INDEX `set_logs_session_exercise_idx` ON `set_logs` (`session_id`,`exercise_id`);--> statement-breakpoint
CREATE INDEX `program_days_workout_idx` ON `program_days` (`workout_id`);--> statement-breakpoint
CREATE INDEX `programs_source_idx` ON `programs` (`source_program_id`);--> statement-breakpoint
CREATE INDEX `workout_exercises_exercise_idx` ON `workout_exercises` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `body_checkins_enrollment_idx` ON `body_checkins` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `enrollments_program_idx` ON `enrollments` (`program_id`);--> statement-breakpoint
CREATE INDEX `session_exercises_exercise_idx` ON `session_exercises` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_enrollment_idx` ON `workout_sessions` (`enrollment_id`,`status`);--> statement-breakpoint
CREATE INDEX `workout_sessions_workout_idx` ON `workout_sessions` (`workout_id`);