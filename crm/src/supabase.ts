import { createClient, type SupabaseClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const configured = Boolean(url && key && /^https:\/\//i.test(url));
// A chave anon/publishable pode ser pública; NUNCA incluir service_role ou segredo aqui.
export const supabase: SupabaseClient | null = configured ? createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
