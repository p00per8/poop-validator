-- ============================================================================
-- Storico modelli: protezione contro DELETE (append-only)
-- Esegui nel SQL Editor di Supabase se vuoi un vincolo a livello database.
--
-- Contratto per ogni nuovo training (invariato rispetto al primo che funziona):
--   - INSERT nuova riga in model_versions (nuovo version / id), mai TRUNCATE.
--   - Eventuale UPDATE is_active=false sulle righe precedenti, mai DELETE.
--   - Stesso per training_history: solo INSERT + UPDATE contatori aggregati.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.forbid_training_audit_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'DELETE disabilitato su %: storico append-only. Nuovo training = nuova riga.',
    TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS tr_no_delete_model_versions ON public.model_versions;
CREATE TRIGGER tr_no_delete_model_versions
  BEFORE DELETE ON public.model_versions
  FOR EACH ROW
  EXECUTE PROCEDURE public.forbid_training_audit_delete();

-- Se hai public.training_history, decommenta:
-- DROP TRIGGER IF EXISTS tr_no_delete_training_history ON public.training_history;
-- CREATE TRIGGER tr_no_delete_training_history
--   BEFORE DELETE ON public.training_history
--   FOR EACH ROW
--   EXECUTE PROCEDURE public.forbid_training_audit_delete();
