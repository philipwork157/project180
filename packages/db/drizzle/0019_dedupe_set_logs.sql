-- Custom SQL migration file, put your code below! --
-- Before the one-row-per-set rule (next migration): where the same set of the same exercise in a
-- workout was saved twice under different ids, keep the newest copy (the last numbers sent).
DELETE FROM `set_logs` WHERE `id` NOT IN (SELECT max(`id`) FROM `set_logs` GROUP BY `session_id`, `exercise_id`, `set_number`, `is_warmup`);
