// PURM V9 R3 - Estado de conexao da WhatsApp Cloud API para administradores.
// Nao grava credenciais, nao envia mensagens e nao expõe tokens.
import { withSupabase } from 'npm:@supabase/server@1';
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
const env = (key: string) => (Deno.env.get(key) || '').trim();
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return reply({ error: 'Metodo nao permitido' }, 405);
    const admin = await ctx.supabase.rpc('purm_is_admin');
    if (admin.error || admin.data !== true) return reply({ error: 'Apenas a diretoria/admin pode verificar a conexao' }, 403);

    const phoneId = env('PURM_META_PHONE_NUMBER_ID');
    const token = env('PURM_META_ACCESS_TOKEN');
    const appSecret = env('PURM_META_APP_SECRET');
    const verifyToken = env('PURM_META_VERIFY_TOKEN');
    const configured = Boolean(phoneId && token && appSecret && verifyToken);
    const callbackUrl = `${env('SUPABASE_URL')}/functions/v1/purm-whatsapp-webhook`;
    if (!configured) return reply({ configured: false, apiReady: false, receiving: false,
      connected: false, callbackUrl, missing: [
        ...(!phoneId ? ['PURM_META_PHONE_NUMBER_ID'] : []),
        ...(!token ? ['PURM_META_ACCESS_TOKEN'] : []),
        ...(!appSecret ? ['PURM_META_APP_SECRET'] : []),
        ...(!verifyToken ? ['PURM_META_VERIFY_TOKEN'] : [])
      ] });
    if (!/^\d{5,30}$/.test(phoneId)) return reply({ configured: false, apiReady: false, connected: false,
      callbackUrl, error: 'Phone Number ID invalido; informe o ID, nao o numero de telefone.' }, 200);
    let apiReady = false;
    let displayPhoneNumber = '';
    let error = '';
    try {
      const response = await fetch(`https://graph.facebook.com/v26.0/${phoneId}?fields=id,display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000)
      });
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>;
        apiReady = String(data.id || '') === phoneId;
        displayPhoneNumber = typeof data.display_phone_number === 'string' ? data.display_phone_number.slice(0, 32) : '';
      } else { error = `A Meta recusou a verificacao (HTTP ${response.status}). Confira o token e o Phone Number ID.`; }
    } catch { error = 'A consulta a Meta nao respondeu. Tente novamente.'; }
    let receivedAt: string | null = null;
    let inboundCount = 0;
    let storageReady = false;
    try {
      const latest = await ctx.supabaseAdmin.from('purm_whatsapp_webhook_events')
        .select('received_at').in('status', ['received', 'ack_sent', 'ack_failed']).order('received_at', { ascending: false }).limit(1).maybeSingle();
      storageReady = !latest.error;
      receivedAt = latest.data?.received_at || null;
      if (storageReady) {
        const total = await ctx.supabaseAdmin.from('purm_whatsapp_webhook_events')
          .select('id', { count: 'exact', head: true }).in('status', ['received', 'ack_sent', 'ack_failed']);
        inboundCount = total.count || 0;
      }
    } catch { /* Estado do SQL pendente; nao expor erros internos. */ }
    const receiving = Boolean(receivedAt);
    return reply({ configured, apiReady, receiving, connected: apiReady && storageReady && receiving,
      storageReady, callbackUrl, displayPhoneNumber, inboundCount, lastReceivedAt: receivedAt,
      autoReplyEnabled: env('PURM_WHATSAPP_TEST_REPLY_ENABLED') === 'true', ...(error ? { error } : {}) });
  })
};
