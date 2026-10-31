// PURM V7: OAuth2 callback. Public endpoint; single-use state + PKCE protects authorization.
// Deploy with Verify JWT with legacy secret OFF. Never show OAuth tokens in logs or URLs.
import { withSupabase } from 'npm:@supabase/server@1';
const env = (key: string) => Deno.env.get(key)?.trim() || '';
const HOME = 'https://purm.com.br/crm/';
const redirect = (status: 'connected' | 'error') => Response.redirect(`${HOME}?google_calendar=${status}`, 303);
const base64 = (buf: Uint8Array) => btoa(String.fromCharCode(...buf));
async function hash(input: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
  return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function encryptRefreshToken(token: string) {
  let keyData: Uint8Array;
  try { keyData = Uint8Array.from(atob(env('PURM_GOOGLE_TOKEN_KEY')), x => x.charCodeAt(0)); }
  catch { throw new Error('Segredo de criptografia invalido'); }
  if (keyData.length !== 32) throw new Error('Segredo de criptografia ausente');
  const key = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv); combined.set(encrypted, iv.length);
  return base64(combined);
}
export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'GET') return new Response('Metodo nao permitido', { status: 405 });
    const params = new URL(req.url).searchParams;
    const code = params.get('code') || '';
    const state = params.get('state') || '';
    if (params.has('error') || !code || !/^[a-zA-Z0-9_-]{30,160}$/.test(state)) return redirect('error');
    const adminDb = ctx.supabaseAdmin;
    if (!adminDb) return redirect('error');
    const stateHash = await hash(state);
    const { data: pending, error } = await adminDb.from('purm_google_oauth_states')
      .select('state_hash,code_verifier,user_id,expires_at,used_at')
      .eq('state_hash', stateHash).gt('expires_at', new Date().toISOString())
      .is('used_at', null).maybeSingle();
    if (error || !pending) return redirect('error');
    // Mark consumed BEFORE token exchange to avoid replay with the same authorization code.
    const used = new Date().toISOString();
    const { data: consumed, error: consumeError } = await adminDb.from('purm_google_oauth_states')
      .update({ used_at: used }).eq('state_hash', stateHash).is('used_at', null).select('state_hash').maybeSingle();
    if (consumeError || !consumed) return redirect('error');
    try {
      if (env('GOOGLE_REDIRECT_URI') !== 'https://nswjifgyyfgdmzczxgkw.supabase.co/functions/v1/purm-google-calendar-callback')
        return redirect('error');
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'),
          redirect_uri: env('GOOGLE_REDIRECT_URI'), code, code_verifier: pending.code_verifier,
          grant_type: 'authorization_code',
        }), signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return redirect('error');
      const token = await response.json();
      if (!token.refresh_token) return redirect('error');
      const encrypted = await encryptRefreshToken(String(token.refresh_token));
      const { error: saveError } = await adminDb.from('purm_google_connections').upsert({
        id: 1, owner_user_id: pending.user_id, calendar_id: 'primary',
        refresh_token_encrypted: encrypted, connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (saveError) return redirect('error');
      await adminDb.from('purm_google_calendar_audit').insert({ actor_id: pending.user_id, action: 'connect' });
      return redirect('connected');
    } catch {
      return redirect('error');
    }
  }),
};
