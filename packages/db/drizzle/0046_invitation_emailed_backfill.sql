-- Invitations made before 0045 were always emailed straight away: mark them as sent.
UPDATE `invitations` SET `emailed_at` = `created_at` WHERE `emailed_at` IS NULL;
