-- PURM V6 - IA Prospector e IA Analista
-- APLICAR MANUALMENTE, após backup, somente no projeto Supabase PURM.
-- Não alterar outras tabelas, não disparar mensagens, não fazer seed.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.purm_can(text)') IS NULL
 OR to_regprocedure('public.purm_ai_allow_call()') IS NULL
 OR to_regprocedure('public.purm_ai_secret_v5(text,text)') IS NULL
 THEN RAISE EXCEPTION 'Antes da V6 execute/valide os SQLs de permissões V3, IA V4 e Vault V5.';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.purm_prospect_blocklist (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_name text NOT NULL CHECK (char_length(btrim(company_name)) BETWEEN 2 AND 160),
 normalized_name text NOT NULL UNIQUE CHECK (char_length(normalized_name) BETWEEN 2 AND 160),
 reason text NOT NULL DEFAULT '',
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purm_prospect_blocklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purm_v6_block_read ON public.purm_prospect_blocklist;
CREATE POLICY purm_v6_block_read ON public.purm_prospect_blocklist
 FOR SELECT TO authenticated USING (public.purm_can('crm.view'));
DROP POLICY IF EXISTS purm_v6_block_insert ON public.purm_prospect_blocklist;
CREATE POLICY purm_v6_block_insert ON public.purm_prospect_blocklist
 FOR INSERT TO authenticated WITH CHECK (created_by=(SELECT auth.uid()) AND public.purm_can('crm.edit'));
DROP POLICY IF EXISTS purm_v6_block_update ON public.purm_prospect_blocklist;
CREATE POLICY purm_v6_block_update ON public.purm_prospect_blocklist
 FOR UPDATE TO authenticated USING (public.purm_can('crm.edit')) WITH CHECK (public.purm_can('crm.edit'));
-- Nenhuma politica de exclusao automatica.

CREATE TABLE IF NOT EXISTS public.purm_lead_ai_analyses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.purm_crm_leads(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 executive_summary text NOT NULL,
 cargo_diagnosis text NOT NULL DEFAULT '',
 commercial_opportunities text NOT NULL DEFAULT '',
 recommended_approach text NOT NULL DEFAULT '',
 whatsapp_message text NOT NULL DEFAULT '',
 probable_objections text NOT NULL DEFAULT '',
 next_step text NOT NULL DEFAULT '',
 interest_level text NOT NULL DEFAULT 'medium' CHECK (interest_level IN ('low','medium','high','very_high')),
 commercial_score integer NOT NULL CHECK (commercial_score BETWEEN 0 AND 100),
 model_used text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purm_ai_analyses_lead_date_idx ON public.purm_lead_ai_analyses(lead_id,created_at DESC);
ALTER TABLE public.purm_lead_ai_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purm_v6_analyses_read ON public.purm_lead_ai_analyses;
CREATE POLICY purm_v6_analyses_read ON public.purm_lead_ai_analyses
 FOR SELECT TO authenticated USING (public.purm_can('crm.view'));
-- Nenhuma politica de INSERT, UPDATE ou DELETE para navegador.
-- Apenas Edge Function autenticada/verificada escreve pelo papel service_role.
COMMIT;

-- Diagnostico somente leitura:
-- SELECT to_regclass('public.purm_prospect_blocklist'), to_regclass('public.purm_lead_ai_analyses');
