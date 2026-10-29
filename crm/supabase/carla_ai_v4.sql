-- PURM V4 - LIMITADOR DE CHAMADAS DA IA
-- Executar manualmente APENAS no projeto Supabase PURM, apos backup e revisao.
-- Nao altera dados financeiros, usuarios, leads ou permissoes existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.purm_ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  minute_bucket timestamptz NOT NULL,
  requests integer NOT NULL DEFAULT 0 CHECK (requests BETWEEN 1 AND 6),
  PRIMARY KEY (user_id, minute_bucket)
);
ALTER TABLE public.purm_ai_usage ENABLE ROW LEVEL SECURITY;
-- Nenhuma politica CRUD direta. A escrita ocorre apenas pela funcao controlada abaixo.

CREATE OR REPLACE FUNCTION public.purm_ai_allow_call()
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_bucket timestamptz := date_trunc('minute', now());
  v_count integer;
BEGIN
  IF v_user IS NULL OR NOT public.purm_can('secretary.use') THEN
    RETURN false;
  END IF;
  INSERT INTO public.purm_ai_usage(user_id, minute_bucket, requests)
  VALUES (v_user, v_bucket, 1)
  ON CONFLICT (user_id, minute_bucket)
  DO UPDATE SET requests = public.purm_ai_usage.requests + 1
  WHERE public.purm_ai_usage.requests < 6
  RETURNING requests INTO v_count;
  RETURN v_count IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.purm_ai_allow_call() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purm_ai_allow_call() TO authenticated;
COMMIT;

-- Validacao sem modificar dados:
-- SELECT to_regclass('public.purm_ai_usage'), to_regprocedure('public.purm_ai_allow_call()');
