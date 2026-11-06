-- PURM V9 R3 - WHATSAPP CLOUD API: auditoria minima de recebimento.
-- EXECUCAO MANUAL, somente no projeto Supabase da PURM, APOS BACKUP.
-- Nao envia mensagens, nao modifica financeiro/CRM, nao registra tokens.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.purm_crm_members') IS NULL THEN
    RAISE EXCEPTION 'Cadastro PURM V3 ausente. Nenhuma alteracao.';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.purm_whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text NOT NULL UNIQUE CHECK (char_length(wa_message_id) BETWEEN 5 AND 300),
  sender_phone text NOT NULL CHECK (sender_phone ~ '^[0-9]{10,15}$'),
  member_user_id uuid REFERENCES auth.users(id),
  message_type text NOT NULL DEFAULT 'unknown' CHECK (char_length(message_type) BETWEEN 1 AND 35),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','unauthorized','ack_sent','ack_failed','ignored')),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purm_wa_webhook_received_idx ON public.purm_whatsapp_webhook_events(received_at DESC);
ALTER TABLE public.purm_whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
-- Os eventos contem metadados de contatos. Somente Edge Functions com papel de servidor.
REVOKE ALL ON public.purm_whatsapp_webhook_events FROM PUBLIC, anon, authenticated;
COMMIT;
