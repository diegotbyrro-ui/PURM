-- PURM V7 - Google Agenda; execute MANUALMENTE no projeto PURM apos backup.
-- Nao mexe em leads, usuarios, financeiro, nem em tabelas ja existentes.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.purm_is_admin()') IS NULL
  OR to_regprocedure('public.purm_can(text)') IS NULL
  OR to_regclass('public.purm_secretary_events') IS NULL
 THEN RAISE EXCEPTION 'Dependencias da V3 ou da agenda interna ausentes. Nenhuma alteracao.';
 END IF;
END $$;

-- State nonce hashed, PKCE code verifier kept for <=10min; never readable from browser.
CREATE TABLE IF NOT EXISTS public.purm_google_oauth_states (
  state_hash text PRIMARY KEY CHECK (length(state_hash) BETWEEN 40 AND 90),
  code_verifier text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purm_google_oauth_states ENABLE ROW LEVEL SECURITY;

-- AES-256-GCM ciphertext. Only Supabase Edge Functions secret/admin client reads this.
CREATE TABLE IF NOT EXISTS public.purm_google_connections (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  calendar_id text NOT NULL DEFAULT 'primary' CHECK (calendar_id = 'primary'),
  refresh_token_encrypted text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purm_google_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.purm_google_calendar_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('connect','disconnect','create','update','delete')),
  local_event_id uuid,
  google_event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purm_google_audit_created_idx ON public.purm_google_calendar_audit(created_at DESC);
ALTER TABLE public.purm_google_calendar_audit ENABLE ROW LEVEL SECURITY;

-- No browser INSERT/UPDATE/DELETE policies on secrets, nonce or audit tables.
-- Administrators can view only audit metadata, never OAuth secrets.
DROP POLICY IF EXISTS purm_google_audit_read_v7 ON public.purm_google_calendar_audit;
CREATE POLICY purm_google_audit_read_v7 ON public.purm_google_calendar_audit
  FOR SELECT TO authenticated USING (public.purm_is_admin());

-- Explicitly restrict table grants; access is through authenticated Edge Functions only.
REVOKE ALL ON public.purm_google_oauth_states FROM anon, authenticated;
REVOKE ALL ON public.purm_google_connections FROM anon, authenticated;
REVOKE ALL ON public.purm_google_calendar_audit FROM anon, authenticated;
GRANT SELECT ON public.purm_google_calendar_audit TO authenticated;
COMMIT;
