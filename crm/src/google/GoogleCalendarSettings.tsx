import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabase';

type CalendarStatus = { connected: boolean; calendarId: string | null; connectedAt: string | null };

export default function GoogleCalendarSettings() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    if (!supabase) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<CalendarStatus>('purm-google-calendar', { body: { action: 'status' } });
      if (error || !data || 'error' in data) throw new Error('Nao foi possivel consultar a conexao. Confira o SQL e a Edge Function V7.');
      setStatus(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function connect() {
    if (!supabase || busy) return;
    setBusy(true); setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>('purm-google-calendar', { body: { action: 'connect' } });
      if (error || !data?.url) throw new Error(data?.error || 'Nao foi possivel iniciar o Google OAuth.');
      // Navigation only to Google's fixed authorization endpoint returned by the server.
      const url = new URL(data.url);
      if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth') throw new Error('Destino OAuth inesperado');
      window.location.assign(url.toString());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  }
  async function disconnect() {
    if (!supabase || busy || !window.confirm('Desconectar o Google Agenda da PURM? Compromissos existentes no Google nao serao excluidos.')) return;
    setBusy(true); setMessage('');
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('purm-google-calendar', { body: { action: 'disconnect', confirm: true } });
    if (error || !data?.ok) setMessage(data?.error || 'Nao foi possivel desconectar.');
    else { setStatus(null); setMessage('Conexao removida da PURM. Para revogar o token no Google, acesse a seguranca da conta Google.'); }
    setBusy(false);
  }
  return <div className="admin-connection">
    <h3><CalendarDays size={18}/> Google Agenda da PURM</h3>
    <span className="admin-status">{status?.connected ? 'Conectado' : 'Nao conectado'}</span>
    <p>{status?.connected ? 'A Secretária pode sincronizar compromissos autorizados com a agenda Google da empresa.' : 'Conecte uma conta Google autorizada. O Client Secret e os tokens permanecem no Supabase.'}</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {!status?.connected ? <button type="button" className="primary" onClick={() => void connect()} disabled={busy}><ExternalLink size={15}/> Conectar Google Agenda</button>
        : <button type="button" className="secondary" onClick={() => void disconnect()} disabled={busy}>Desconectar</button>}
      <button type="button" className="secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={15}/> Atualizar</button>
    </div>
    {status?.connected && <p><ShieldCheck size={16}/> Autorizado. Compromissos podem ter alertas Google de 24 horas e 1 hora.</p>}
    {message && <p role="status" className="finance-notice">{message}</p>}
    <p style={{ fontSize: 12 }}>Exclusoes exigem confirmacao. Google nao envia avisos pelo WhatsApp nesta integracao.</p>
  </div>;
}
