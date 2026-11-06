// PURM V9 R3 - Webhook oficial da Meta WhatsApp Cloud API.
// Assinatura HMAC obrigatoria, deduplicacao por ID, acesso por usuario autorizado.
// NUNCA registra conteudo da mensagem, chaves ou tokens em log.
// Respostas desligadas por padrao; nao executa alteracoes financeiras/agenda/CRM.
import { createClient } from 'npm:@supabase/supabase-js@2.79.0';

type J = Record<string, unknown>;
const env = (name: string) => (Deno.env.get(name) || '').trim();
const body = (text: string, status = 200) => new Response(text, {
  status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
});
function equalsHex(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function signatureValid(raw: string, signature: string): Promise<boolean> {
  const secret = env('PURM_META_APP_SECRET');
  if (!secret || !signature.startsWith('sha256=')) return false;
  const bytes = new TextEncoder().encode(raw);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
  const digest = Array.from(mac, x => x.toString(16).padStart(2, '0')).join('');
  return equalsHex(digest, signature.slice(7));
}
function adminClient() {
  const url = env('SUPABASE_URL');
  let key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) {
    try { key = String((JSON.parse(env('SUPABASE_SECRET_KEYS')) as J).default || ''); }
    catch { key = ''; }
  }
  if (!url || !key) throw new Error('Servidor Supabase sem credenciais internas');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const number = (v: unknown) => typeof v === 'string' ? v.replace(/[^0-9]/g, '') : '';
const isSafeId = (v: unknown) => typeof v === 'string' && v.length >= 5 && v.length <= 300;
const help = (s: string) => /^(?:oi|ola|olá|teste|status|ajuda|menu)[!.\s]*$/i.test(s.trim());
async function handleEvent(value: J, client: ReturnType<typeof adminClient>) {
  const metadata = (value.metadata || {}) as J;
  if (String(metadata.phone_number_id || '') !== env('PURM_META_PHONE_NUMBER_ID')) return;
  if (!Array.isArray(value.messages)) return;
  for (const msg0 of value.messages.slice(0, 20)) {
    if (!msg0 || typeof msg0 !== 'object') continue;
    const msg = msg0 as J;
    const id = msg.id;
    const from = number(msg.from);
    if (!isSafeId(id) || !/^[0-9]{10,15}$/.test(from)) continue;
    const type = typeof msg.type === 'string' ? msg.type.slice(0, 35) : 'unknown';
    const { data: member, error: memberError } = await client.from('purm_crm_members')
      .select('user_id,role,permissions').eq('phone_e164', from).limit(1).maybeSingle();
    if (memberError) throw new Error('Falha ao verificar usuario cadastrado');
    const perms = Array.isArray(member?.permissions) ? member.permissions : [];
    const authorized = Boolean(member && (member.role === 'admin' || perms.includes('secretary.use')));
    const { data: inserted, error: insertError } = await client.from('purm_whatsapp_webhook_events')
      .upsert({wa_message_id:id, sender_phone:from, member_user_id:member?.user_id || null,
        message_type:type, status:authorized?'received':'unauthorized'},
        {onConflict:'wa_message_id',ignoreDuplicates:true}).select('id').maybeSingle();
    if (insertError) throw new Error('Falha de registro/deduplicacao do webhook');
    if (!inserted || !authorized) continue;
    // Teste inicial: nenhuma mensagem sai sem habilitacao voluntaria via segredo.
    if (env('PURM_WHATSAPP_TEST_REPLY_ENABLED') !== 'true' || type !== 'text') continue;
    const text = ((msg.text || {}) as J).body;
    if (typeof text !== 'string' || !help(text)) continue;
    const accessToken = env('PURM_META_ACCESS_TOKEN');
    const phoneId = env('PURM_META_PHONE_NUMBER_ID');
    if (!accessToken || !phoneId) continue;
    let status = 'ack_failed';
    try {
      const response = await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`, {
        method:'POST', headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
        body: JSON.stringify({messaging_product:'whatsapp', recipient_type:'individual', to:from,
          type:'text', text:{preview_url:false,body:'PURM Secretária IA: conexão confirmada. Seu número está autorizado. As funções de agenda, financeiro e prospecção pelo WhatsApp serão liberadas após os próximos testes.'}}),
        signal:AbortSignal.timeout(12000)
      });
      if (response.ok) status = 'ack_sent';
    } catch { /* Status de tentativa sera registrado; Meta pode reenviar webhook. */ }
    await client.from('purm_whatsapp_webhook_events').update({status,updated_at:new Date().toISOString()}).eq('wa_message_id',id);
  }
}
export default { async fetch(req: Request) {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') || '';
    if (mode === 'subscribe' && env('PURM_META_VERIFY_TOKEN') && token === env('PURM_META_VERIFY_TOKEN')
      && /^[0-9]{1,100}$/.test(challenge)) return body(challenge);
    return body('Verificacao nao autorizada',403);
  }
  if (req.method !== 'POST') return body('Metodo nao permitido',405);
  const header = req.headers.get('X-Hub-Signature-256') || '';
  if (Number(req.headers.get('Content-Length') || '0') > 256000) return body('Tamanho excedido',413);
  let raw = '';
  try {raw = await req.text();} catch {return body('Corpo invalido',400);}
  if (raw.length > 256000) return body('Tamanho excedido',413);
  if (!await signatureValid(raw,header)) return body('Assinatura invalida',403);
  let payload: J;
  try {payload = JSON.parse(raw) as J;} catch {return body('JSON invalido',400);}
  if (payload.object !== 'whatsapp_business_account') return body('Evento ignorado');
  try {
    const client=adminClient();
    for (const entry0 of Array.isArray(payload.entry)?payload.entry.slice(0,10):[]) {
      if (!entry0 || typeof entry0 !== 'object') continue;
      const entry=entry0 as J;
      for (const change0 of Array.isArray(entry.changes)?entry.changes.slice(0,10):[]) {
        if (!change0 || typeof change0 !== 'object') continue;
        const change=change0 as J;
        if (change.field !== 'messages' || !change.value || typeof change.value !== 'object') continue;
        await handleEvent(change.value as J,client);
      }
    }
    return body('EVENT_RECEIVED');
  } catch {
    // A Meta tentara novamente. Nao registrar corpo do webhook ou telefones em logs.
    return body('Falha temporaria',503);
  }
}};
