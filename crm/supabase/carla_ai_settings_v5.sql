-- PURM V5 - Segredo OpenAI no Supabase Vault e identidade editavel.
-- Executar MANUALMENTE no SQL Editor do projeto PURM, apos backup.
-- Seguro para repetir: nao remove dados, nao grava nenhuma chave real.
BEGIN;

DO $$ BEGIN
  IF to_regclass('vault.secrets') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Supabase Vault nao habilitado. Ative Database > Extensions > supabase_vault antes de executar.';
  END IF;
END $$;

ALTER TABLE public.purm_secretary_settings ALTER COLUMN name SET DEFAULT 'Assistente';
-- Remove o nome legado que foi incluido como padrao nas versoes anteriores.
UPDATE public.purm_secretary_settings SET name='Assistente', updated_at=now()
WHERE id=1 AND name='Carla';

CREATE OR REPLACE FUNCTION public.purm_ai_secret_v5(p_action text, p_secret text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_id uuid; v_value text;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name='purm_openai_api_key' LIMIT 1;
  IF p_action='status' THEN
    RETURN jsonb_build_object('configured', v_id IS NOT NULL);
  ELSIF p_action='set' THEN
    IF p_secret IS NULL OR p_secret !~ '^sk-[A-Za-z0-9_-]{20,300}$' THEN
      RAISE EXCEPTION 'Formato de chave OpenAI invalido';
    END IF;
    IF v_id IS NULL THEN
      PERFORM vault.create_secret(p_secret,'purm_openai_api_key','Chave API OpenAI da secretaria PURM');
    ELSE
      PERFORM vault.update_secret(v_id,p_secret);
    END IF;
    RETURN jsonb_build_object('configured',true);
  ELSIF p_action='get' THEN
    SELECT decrypted_secret INTO v_value FROM vault.decrypted_secrets
      WHERE name='purm_openai_api_key' LIMIT 1;
    RETURN jsonb_build_object('key',v_value);
  ELSE
    RAISE EXCEPTION 'Acao invalida';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.purm_ai_secret_v5(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purm_ai_secret_v5(text,text) TO service_role;
COMMIT;
-- Diagnostico de seguranca: SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema='public' AND routine_name='purm_ai_secret_v5';
