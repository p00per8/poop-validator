-- Eseguire in Supabase se la Training App mostra abbastanza "nuove" ma il train risponde "not enough photos".
-- In JS NULL conta come non usata; in SQL `WHERE used_in_training = false` ignora NULL.

UPDATE training_photos
SET used_in_training = false
WHERE used_in_training IS NULL;
