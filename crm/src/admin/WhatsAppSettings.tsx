import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, MessageCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabase';

type Status = {
  configured?: boolean; apiReady?: boolean; receiving?: boolean; connected?: boolean;
  storageReady?: boolean; callbackUrl?: string; displayPhoneNumber?: string;
  inboundCount?: number; lastReceivedAt?: string|null; autoReplyEnabled?: boolean;
  missing?: string[]; error?: string;
};
export default function WhatsAppSettings() {
  const [status,setStatus]=useState<Status|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  async function refresh() {
    if(!supabase)return;
    setBusy(true);setMessage('');
    try {
      const {data,error}=await supabase.functions.invoke<Status>('purm-whatsapp-status',{body:{action:'status'}});
      if(error)throw error;
      setStatus(data || {});
    } catch(e) {setMessage(e instanceof Error?e.message:'Nao foi possivel consultar o Supabase.');}
    finally {setBusy(false);}
  }
  useEffect(()=>{void refresh();},[]);
  const connected=Boolean(status?.connected);
  return <div className="admin-connection">
    <h3><MessageCircle size={18}/> WhatsApp Cloud API — PURM Secretária IA</h3>
    <span className={connected?'ai-connected':'admin-status'}>
      {connected?'Conectado':status?.apiReady?'API validada; aguardando primeira mensagem':'Não conectado'}
    </span>
    <p>Canal oficial Meta. A conexão exige API válida, banco preparado e webhook autenticado com uma mensagem recebida.</p>
    {status?.displayPhoneNumber&&<p><strong>Número validado pela Meta:</strong> {status.displayPhoneNumber}</p>}
    {status?.lastReceivedAt&&<p><strong>Última mensagem recebida:</strong> {new Date(status.lastReceivedAt).toLocaleString('pt-BR')} · {status.inboundCount||0} mensagem(ns) registradas.</p>}
    {status?.configured&&!status.storageReady&&<p>Execute o SQL PURM V9 R3 antes do teste.</p>}
    {status?.missing?.length?<p>Segredos pendentes no Supabase: <code>{status.missing.join(', ')}</code></p>:null}
    {status?.error&&<p role="alert">{status.error}</p>}
    {message&&<p role="alert">{message}</p>}
    {status?.callbackUrl&&<p style={{overflowWrap:'anywhere'}}><strong>Callback do webhook:</strong> <code>{status.callbackUrl}</code></p>}
    <p><ShieldCheck size={14}/> Somente funcionários cadastrados com permissão de Secretária serão identificados. Nenhum comando financeiro é executado nesta primeira fase.</p>
    <p>Resposta de teste: <strong>{status?.autoReplyEnabled?'habilitada':'desativada'}</strong>. A configuração é feita nos segredos do Supabase, nunca no navegador.</p>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
      <button type="button" className="secondary" onClick={()=>void refresh()} disabled={busy}>
        <RefreshCw size={15}/>{busy?'Verificando...':'Verificar conexão'}
      </button>
      {connected&&<span><CheckCircle2 size={15} color="#178759"/> Webhook recebido</span>}
      <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Abrir Meta for Developers</a>
    </div>
  </div>;
}
