// PURM V7: Google Agenda. Authenticated CRM operations only.
import { withSupabase } from 'npm:@supabase/server@1';

type D = Record<string, unknown>;
const json = (body: D, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const env = (key: string) => Deno.env.get(key)?.trim() || '';
const base64 = (buf: Uint8Array) => btoa(String.fromCharCode(...buf));
function randomUrlSafe(bytes = 32) {
  return base64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256UrlSafe(input: string) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
  return base64(hash).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function getKey() {
  const raw = env('PURM_GOOGLE_TOKEN_KEY');
  let decoded: Uint8Array;
  try { decoded = Uint8Array.from(atob(raw), x => x.charCodeAt(0)); }
  catch { throw new Error('Chave de criptografia Google nao configurada'); }
  if (decoded.length !== 32) throw new Error('A chave de criptografia deve conter 32 bytes');
  return crypto.subtle.importKey('raw', decoded, 'AES-GCM', false, ['decrypt']);
}
async function decryptToken(encrypted: string) {
  const raw = Uint8Array.from(atob(encrypted), x => x.charCodeAt(0));
  if (raw.length < 29) throw new Error('Token Google invalido');
  const key = await getKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, key, raw.subarray(12));
  return new TextDecoder().decode(plain);
}
async function getAccessToken(connection: { refresh_token_encrypted: string }) {
  const refreshToken = await decryptToken(connection.refresh_token_encrypted);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }), signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Autorizacao Google expirada ou revogada; reconecte a conta');
  const data = await response.json();
  if (!data.access_token) throw new Error('Google nao retornou token de acesso');
  return String(data.access_token);
}
async function calendarApi(token: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404 || response.status === 409) return { status: response.status, data: null };
  if (!response.ok) throw new Error(`Google Calendar retornou HTTP ${response.status}`);
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
const asString = (value: unknown, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405);
    let body: D;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalido' }, 400); }
    const action = asString(body.action, 32);
    const { data: admin, error: adminError } = await ctx.supabase.rpc('purm_is_admin');
    const { data: allowed, error: permissionError } = await ctx.supabase.rpc('purm_can', { p_permission: 'secretary.use' });
    if (adminError || permissionError) return json({ error: 'Nao foi possivel verificar permissoes' }, 503);
    if (!admin && !allowed) return json({ error: 'Acesso negado' }, 403);
    const { data: currentUser, error: userError } = await ctx.supabase.auth.getUser();
    const userId = currentUser?.user?.id;
    if (userError || !userId) return json({ error: 'Sessao invalida' }, 401);
    const adminDb = ctx.supabaseAdmin;
    if (!adminDb) return json({ error: 'Acesso ao servidor indisponivel' }, 503);

    if (action === 'status') {
      const { data, error } = await adminDb.from('purm_google_connections')
        .select('connected_at,updated_at,calendar_id').eq('id', 1).maybeSingle();
      if (error) return json({ error: 'Estrutura V7 ainda nao instalada' }, 503);
      return json({ connected: Boolean(data), calendarId: data?.calendar_id ?? null, connectedAt: data?.connected_at ?? null });
    }
    if (action === 'connect') {
      if (!admin) return json({ error: 'Somente um administrador pode conectar a conta Google' }, 403);
      if (!env('GOOGLE_CLIENT_ID') || !env('GOOGLE_CLIENT_SECRET') || !env('GOOGLE_REDIRECT_URI') || !env('PURM_GOOGLE_TOKEN_KEY'))
        return json({ error: 'Credenciais Google ou chave de criptografia ausentes' }, 503);
      const state = randomUrlSafe();
      const codeVerifier = randomUrlSafe(64);
      const { error } = await adminDb.from('purm_google_oauth_states').insert({
        state_hash: await sha256UrlSafe(state), code_verifier: codeVerifier,
        user_id: userId, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) return json({ error: 'Nao foi possivel iniciar autorizacao Google' }, 503);
      const params = new URLSearchParams({
        client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: env('GOOGLE_REDIRECT_URI'),
        response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar.events.owned',
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false',
        state, code_challenge: await sha256UrlSafe(codeVerifier), code_challenge_method: 'S256',
      });
      return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
    }
    if (action === 'disconnect') {
      if (!admin || body.confirm !== true) return json({ error: 'Confirmacao de administrador exigida' }, 403);
      const { error } = await adminDb.from('purm_google_connections').delete().eq('id', 1);
      if (error) return json({ error: 'Nao foi possivel desconectar' }, 503);
      await adminDb.from('purm_google_calendar_audit').insert({ actor_id: userId, action: 'disconnect' });
      return json({ ok: true, message: 'Conexao interna removida. Revogue o acesso no Google para invalidar o token anterior.' });
    }
    if (!['create', 'delete', 'update'].includes(action)) return json({ error: 'Acao invalida' }, 400);
    if (!allowed && !admin) return json({ error: 'Sem permissao para usar agenda' }, 403);
    const eventId = asString(body.eventId, 42);
    if (!validUuid(eventId)) return json({ error: 'ID de compromisso invalido' }, 400);
    const { data: local, error: localError } = await ctx.supabase.from('purm_secretary_events')
      .select('id,title,notes,start_at,end_at,google_event_id,remind_day_before,remind_hour_before')
      .eq('id', eventId).maybeSingle();
    if (localError || !local) return json({ error: 'Compromisso nao encontrado ou acesso negado' }, 404);
    const { data: connection, error: connectionError } = await adminDb.from('purm_google_connections')
      .select('refresh_token_encrypted,calendar_id').eq('id', 1).maybeSingle();
    if (connectionError || !connection) return json({ error: 'Conecte o Google Agenda em Configuracoes primeiro' }, 409);
    let accessToken: string;
    try { accessToken = await getAccessToken(connection); }
    catch { return json({ error: 'Nao foi possivel autenticar no Google. Reconecte a conta.' }, 503); }
    const calendarPath = `calendars/${encodeURIComponent(connection.calendar_id || 'primary')}/events`;
    try {
      if (action === 'create') {
        if (local.google_event_id) return json({ ok: true, googleEventId: local.google_event_id, alreadySynced: true });
        const start = new Date(local.start_at), end = new Date(local.end_at);
        if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) return json({ error: 'Horario invalido' }, 400);
        // Google custom IDs support 0-9/a-v. UUID hexadecimal is allowed and deterministic.
        const googleId = `purm${eventId.replace(/-/g, '').toLowerCase()}`;
        const reminders = [
          ...(local.remind_day_before ? [{ method: 'popup', minutes: 1440 }] : []),
          ...(local.remind_hour_before ? [{ method: 'popup', minutes: 60 }] : []),
        ];
        const event = {
          id: googleId, summary: asString(local.title, 180), description: asString(local.notes, 1500),
          start: { dateTime: start.toISOString(), timeZone: 'America/Recife' },
          end: { dateTime: end.toISOString(), timeZone: 'America/Recife' },
          reminders: { useDefault: false, overrides: reminders },
        };
        const result = await calendarApi(accessToken, 'POST', calendarPath, event);
        if (result.status === 409) {
          const existing = await calendarApi(accessToken, 'GET', `${calendarPath}/${googleId}`);
          if (existing.status === 404) throw new Error('Conflito ao criar compromisso no Google');
        }
        const { error: updateError } = await adminDb.from('purm_secretary_events')
          .update({ google_event_id: googleId }).eq('id', eventId).is('google_event_id', null);
        if (updateError) throw new Error('Evento criado no Google, mas falhou ao marcar sincronizacao; tente novamente');
        await adminDb.from('purm_google_calendar_audit').insert({ actor_id: userId, action: 'create', local_event_id: eventId, google_event_id: googleId });
        return json({ ok: true, googleEventId: googleId });
      }
      if (action === 'delete') {
        if (body.confirm !== true) return json({ error: 'Confirmacao explicita exigida para excluir' }, 400);
        if (local.google_event_id) {
          await calendarApi(accessToken, 'DELETE', `${calendarPath}/${encodeURIComponent(local.google_event_id)}`);
        }
        const { error: deletionError } = await adminDb.from('purm_secretary_events').delete().eq('id', eventId);
        if (deletionError) throw new Error('Evento removido do Google, mas exclusao interna falhou');
        await adminDb.from('purm_google_calendar_audit').insert({ actor_id: userId, action: 'delete', local_event_id: eventId, google_event_id: local.google_event_id });
        return json({ ok: true });
      }
      if (action === 'update') {
        if (body.confirm !== true) return json({ error: 'Confirmacao exigida para alterar' }, 400);
        if (!local.google_event_id) return json({ error: 'Sincronize o evento primeiro' }, 409);
        const title = asString(body.title, 180);
        const start = new Date(asString(body.startAt, 60)), end = new Date(asString(body.endAt, 60));
        if (!title || Number.isNaN(+start) || Number.isNaN(+end) || end <= start) return json({ error: 'Dados de evento invalidos' }, 400);
        const googleUpdate = await calendarApi(accessToken, 'PATCH', `${calendarPath}/${encodeURIComponent(local.google_event_id)}`, {
          summary: title, start: { dateTime: start.toISOString(), timeZone: 'America/Recife' },
          end: { dateTime: end.toISOString(), timeZone: 'America/Recife' },
        });
        if (googleUpdate.status === 404) throw new Error('Evento Google nao encontrado; atualizacao cancelada');
        const { error: updateError } = await adminDb.from('purm_secretary_events').update({ title, start_at: start.toISOString(), end_at: end.toISOString() }).eq('id', eventId);
        if (updateError) throw new Error('Google atualizado mas sincronizacao interna falhou');
        await adminDb.from('purm_google_calendar_audit').insert({ actor_id: userId, action: 'update', local_event_id: eventId, google_event_id: local.google_event_id });
        return json({ ok: true });
      }
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Falha na API Google Agenda' }, 502);
    }
    return json({ error: 'Acao invalida' }, 400);
  }),
};
