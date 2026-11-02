-- PURM V8: configuracao do funil + avaliacoes comerciais.
-- EXECUCAO MANUAL APENAS NO PROJETO SUPABASE DA PURM, APOS BACKUP.
-- NAO reinicializa funil, nao apaga nenhum lead e nao altera SQL V7.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.purm_crm_stages') IS NULL
    OR to_regclass('public.purm_crm_leads') IS NULL
    OR to_regclass('public.purm_crm_interactions') IS NULL
    OR to_regprocedure('public.purm_can(text)') IS NULL
    OR to_regclass('public.purm_lead_ai_analyses') IS NULL
  THEN
    RAISE EXCEPTION 'Pré-requisitos V1/V3/V6 ausentes. Configure a IA Analista V6 antes de aplicar V8.';
  END IF;
END $$;

-- Preserva as politicas de leitura existentes, adiciona escrita de etapas so a administradores.
ALTER TABLE public.purm_crm_stages ENABLE ROW LEVEL SECURITY;
-- Acesso SQL somente para papel authenticated; RLS limita CRUD a admin.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purm_crm_stages TO authenticated;
DROP POLICY IF EXISTS purm_v8_stages_insert ON public.purm_crm_stages;
CREATE POLICY purm_v8_stages_insert ON public.purm_crm_stages
  FOR INSERT TO authenticated WITH CHECK(public.purm_is_admin());
DROP POLICY IF EXISTS purm_v8_stages_update ON public.purm_crm_stages;
CREATE POLICY purm_v8_stages_update ON public.purm_crm_stages
  FOR UPDATE TO authenticated USING(public.purm_is_admin()) WITH CHECK(public.purm_is_admin());
DROP POLICY IF EXISTS purm_v8_stages_delete ON public.purm_crm_stages;
CREATE POLICY purm_v8_stages_delete ON public.purm_crm_stages
  FOR DELETE TO authenticated USING(public.purm_is_admin());

CREATE TABLE IF NOT EXISTS public.purm_lead_coaching_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.purm_crm_leads(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 pitch_text text NOT NULL CHECK(char_length(btrim(pitch_text)) BETWEEN 20 AND 2500),
 strengths text NOT NULL,
 improvements text NOT NULL,
 recommended_reply text NOT NULL DEFAULT '',
 next_action text NOT NULL,
 quality_score integer NOT NULL CHECK(quality_score BETWEEN 0 AND 100),
 model_used text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purm_coaching_lead_date_idx
 ON public.purm_lead_coaching_reviews(lead_id,created_at DESC);
ALTER TABLE public.purm_lead_coaching_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purm_v8_coaching_read ON public.purm_lead_coaching_reviews;
CREATE POLICY purm_v8_coaching_read ON public.purm_lead_coaching_reviews
 FOR SELECT TO authenticated USING(public.purm_can('crm.view'));
-- Sem INSERT/UPDATE/DELETE via browser; insercao exclusivamente pelo servidor autorizado.
REVOKE ALL ON public.purm_lead_coaching_reviews FROM anon,authenticated;
GRANT SELECT ON public.purm_lead_coaching_reviews TO authenticated;
COMMIT;
