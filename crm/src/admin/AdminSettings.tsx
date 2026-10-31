import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bot, CheckCircle2, ImageUp, LockKeyhole, MessageCircle, RefreshCw, Save, ShieldCheck, UsersRound } from 'lucide-react';
import { supabase } from '../supabase';
import OpenAISettings from '../ai/OpenAISettings';
import GoogleCalendarSettings from '../google/GoogleCalendarSettings';

export type Permission = 'crm.view'|'crm.edit'|'finance.view'|'finance.edit'|'secretary.use'|'settings.manage';
export type StaffMember = { user_id:string; email:string; full_name:string; role:string; branch:string; phone_e164:string; notify_whatsapp_leads:boolean; permissions:Permission[] };
export type Identity = { name:string; avatar_url:string|null; whatsapp_number:string; notify_new_leads:boolean; google_status:string; whatsapp_status:string };
const ALL: { id:Permission; label:string }[] = [
  {id:'crm.view',label:'Visualizar CRM e leads'}, {id:'crm.edit',label:'Criar e editar cotações'},
  {id:'finance.view',label:'Visualizar Financeiro'}, {id:'finance.edit',label:'Registrar entradas e saídas'},
  {id:'secretary.use',label:'Usar a Secretária'}, {id:'settings.manage',label:'Administrar usuários e integrações'}
];
export const PERMISSIONS_BY_ROLE: Record<string,Permission[]> = {
  admin: ALL.map(x=>x.id), gestor:['crm.view','crm.edit','finance.view','finance.edit','secretary.use'],
  comercial:['crm.view','crm.edit'], financeiro:['finance.view','finance.edit']
};
const defaultIdentity:Identity={name:'Assistente',avatar_url:null,whatsapp_number:'',notify_new_leads:false,google_status:'nao_conectado',whatsapp_status:'nao_conectado'};
const errText=(e:unknown)=>e instanceof Error?e.message:String(e);

export default function AdminSettings({fullName,role,branch,onSecretaryNameChange}: {fullName:string;role:string;branch:string;onSecretaryNameChange?:(name:string)=>void}){
 const [staff,setStaff]=useState<StaffMember[]>([]);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 const [email,setEmail]=useState(''),[name,setName]=useState(''),[memberRole,setMemberRole]=useState('comercial'),[memberBranch,setMemberBranch]=useState('Recife');
 const [permissions,setPermissions]=useState<Permission[]>([...PERMISSIONS_BY_ROLE.comercial]);
 const [phone,setPhone]=useState(''),[notifyWhatsapp,setNotifyWhatsapp]=useState(false);
 const [identity,setIdentity]=useState<Identity>(defaultIdentity),[uploading,setUploading]=useState(false);
 const reload=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);
  try{
   const [users,profile]=await Promise.all([
    supabase.rpc('purm_admin_list_members'),
    supabase.from('purm_secretary_settings').select('name,avatar_url,whatsapp_number,notify_new_leads,google_status,whatsapp_status').eq('id',1).maybeSingle()
   ]);
   if(users.error)throw users.error;
   if(profile.error)throw profile.error;
   setStaff((users.data||[]) as StaffMember[]);
   if(profile.data)setIdentity(profile.data as Identity);
  }catch(e){setMessage('Não consegui carregar as configurações: '+errText(e));}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void reload();},[reload]);
 function edit(s:StaffMember){setEmail(s.email);setName(s.full_name);setMemberRole(s.role);setMemberBranch(s.branch);setPermissions(s.permissions||[]);setPhone(s.phone_e164||'');setNotifyWhatsapp(Boolean(s.notify_whatsapp_leads));setMessage('Editando '+s.full_name);}
 async function saveMember(e:FormEvent){e.preventDefault();if(!supabase||saving)return;
  if(memberRole!=='admin'&&permissions.includes('settings.manage')){setMessage('Somente administradores podem receber settings.manage.');return;}
  setSaving(true);setMessage('');
  try{
   const {error}=await supabase.rpc('purm_admin_save_member',{p_email:email.trim().toLowerCase(),p_name:name.trim(),p_role:memberRole,p_branch:memberBranch,p_permissions:permissions,p_phone:phone.replace(/\D/g,''),p_notify:notifyWhatsapp});
   if(error)throw error;
   setMessage('Acesso salvo. O usuário deve entrar com a conta criada no Authentication do Supabase.');
   setEmail('');setName('');setMemberRole('comercial');setPermissions([...PERMISSIONS_BY_ROLE.comercial]);setPhone('');setNotifyWhatsapp(false);await reload();
  }catch(e){setMessage('Não foi possível salvar: '+errText(e)+'. Cadastre primeiro esse e-mail em Supabase → Authentication → Users.');}
  finally{setSaving(false);}
 }
 async function saveIdentity(e:FormEvent){e.preventDefault();if(!supabase||saving)return;
  const clean=identity.name.trim();if(clean.length<2||clean.length>60){setMessage('O nome precisa ter de 2 a 60 caracteres.');return;}
  const number=identity.whatsapp_number.replace(/\D/g,'');
  if(number&&!(number.length>=10&&number.length<=15)){setMessage('Número WhatsApp inválido: use DDI + DDD + número.');return;}
  setSaving(true);setMessage('');
  const {error}=await supabase.from('purm_secretary_settings').update({name:clean,avatar_url:identity.avatar_url,whatsapp_number:number,notify_new_leads:identity.notify_new_leads}).eq('id',1);
  setSaving(false);
  if(!error)onSecretaryNameChange?.(clean);
  setMessage(error?'Falha ao salvar identidade: '+error.message:'Identidade interna atualizada. Nome e foto no WhatsApp Business precisam de configuração/aprovação separada pela Meta.');
 }
 async function uploadAvatar(file:File|null){if(!file||!supabase)return;
  if(file.size>2*1024*1024){setMessage('A foto deve ter no máximo 2 MB.');return;}
  const valid=['image/png','image/jpeg','image/webp'];if(!valid.includes(file.type)){setMessage('Escolha PNG, JPG ou WEBP.');return;}
  setUploading(true);setMessage('');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const key=`avatar-${Date.now()}-${Math.random().toString(16).slice(2,10)}.${ext}`;
  try{
   const {error}=await supabase.storage.from('purm-secretary-avatars').upload(key,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
   if(error)throw error;
   const {data}=supabase.storage.from('purm-secretary-avatars').getPublicUrl(key);
   setIdentity(prev=>({...prev,avatar_url:data.publicUrl}));
   setMessage('Foto enviada. Clique em Salvar identidade para aplicá-la no painel. A foto do perfil WhatsApp é atualizada separadamente pela Meta.');
  }catch(e){setMessage('Falha no envio da foto: '+errText(e));}
  finally{setUploading(false);}
 }
 return <div className="admin-settings">
  <section className="hero"><div><span className="eyebrow">ADMINISTRAÇÃO PURM • ACESSO RESTRITO</span><h2>Equipe, permissões e integrações.</h2><p>Gerencie os acessos reais no Supabase e prepare a Secretária para WhatsApp e Google Agenda.</p></div><ShieldCheck color="#2868ff" size={38}/></section>
  {message&&<p role="status" className="finance-notice">{message}</p>}
  <div className="admin-grid">
   <section className="panel"><h3><UsersRound size={19}/> Pessoas autorizadas</h3><p>Para criar uma senha ou convidar um funcionário, primeiro use <b>Supabase → Authentication → Users → Add user</b>. Depois vincule o e-mail aqui. Não há convite automático nesta versão.</p>
    <button className="secondary" onClick={()=>void reload()} disabled={loading}><RefreshCw size={15}/>{loading?'Atualizando...':'Atualizar lista'}</button>
    <div className="admin-members">{staff.map(x=><button key={x.user_id} onClick={()=>edit(x)} className="admin-member"><span><b>{x.full_name}</b><small>{x.email} · {x.branch}</small></span><strong>{x.role}</strong></button>)}{!staff.length&&<p>Nenhum usuário carregado.</p>}</div>
    <form onSubmit={saveMember} className="finance-grid"><label className="full">E-mail existente no Supabase Auth<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="colaborador@purm.com.br"/></label><label>Nome completo<input required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label>Filial<select value={memberBranch} onChange={e=>setMemberBranch(e.target.value)}><option>Recife</option><option>Salvador</option><option>Fortaleza</option></select></label><label className="full">WhatsApp do funcionário para futuros avisos (DDI+DDD+numero)<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="5582999999999" inputMode="tel"/></label><label className="full admin-checkbox"><input type="checkbox" checked={notifyWhatsapp} onChange={e=>setNotifyWhatsapp(e.target.checked)}/> Funcionário concorda em receber avisos de leads no WhatsApp (integração ainda não ativada)</label><label className="full">Cargo<select value={memberRole} onChange={e=>{const r=e.target.value;setMemberRole(r);setPermissions([...(PERMISSIONS_BY_ROLE[r]||[])]);}}><option value="admin">Administrador</option><option value="gestor">Gestor</option><option value="comercial">Comercial</option><option value="financeiro">Financeiro</option></select></label>
     <fieldset className="full admin-permissions"><legend>Permissões — o banco também verifica estes acessos</legend>{ALL.map(x=><label key={x.id}><input type="checkbox" checked={permissions.includes(x.id)} disabled={memberRole==='admin'||(x.id==='settings.manage'&&memberRole!=='admin')} onChange={e=>setPermissions(prev=>e.target.checked?[...new Set([...prev,x.id])]:prev.filter(p=>p!==x.id))}/>{x.label}</label>)}</fieldset>
     <button className="primary full" disabled={saving}><Save size={17}/>{saving?'Salvando...':'Salvar acesso e permissões'}</button>
    </form>
   </section>
   <section className="panel"><h3><Bot size={19}/> Identidade da Secretária</h3><p>Nome e imagem usados dentro da PURM. A foto e o nome visíveis no WhatsApp Business dependem de aprovação e atualização do perfil na Meta.</p>
    <form onSubmit={saveIdentity} className="finance-grid">
     <div className="admin-avatar full">{identity.avatar_url?<img src={identity.avatar_url} alt="Foto da Secretária"/>:<Bot size={34}/>}<label className="secondary"><ImageUp size={16}/>{uploading?'Enviando...':'Enviar foto (até 2 MB)'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={uploading} onChange={e=>{void uploadAvatar(e.target.files?.[0]||null);e.currentTarget.value='';}}/></label></div>
     <label className="full">Nome da Secretária<input minLength={2} maxLength={60} required value={identity.name} onChange={e=>setIdentity(prev=>({...prev,name:e.target.value}))}/></label>
     <label className="full">Número WhatsApp Business da PURM (DDI + DDD)<input type="tel" placeholder="5582999999999" value={identity.whatsapp_number} onChange={e=>setIdentity(prev=>({...prev,whatsapp_number:e.target.value}))}/></label>
     <label className="full admin-checkbox"><input type="checkbox" checked={identity.notify_new_leads} onChange={e=>setIdentity(prev=>({...prev,notify_new_leads:e.target.checked}))}/> Preparar alertas de novos leads para WhatsApp (envio ainda desativado)</label>
     <button type="submit" className="primary full" disabled={saving||uploading}><Save size={17}/> Salvar identidade</button>
    </form>
    <OpenAISettings/>
    <GoogleCalendarSettings/>
    <div className="admin-connection"><h3><MessageCircle size={18}/> WhatsApp Cloud API</h3><span className="admin-status">Não conectado</span><p>Próxima etapa: Meta Business, número autorizado, permissões, webhook verificado e modelos de mensagens para avisos enviados fora da janela de atendimento.</p><a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Abrir Meta for Developers</a></div>
    <div className="admin-connection"><h3><LockKeyhole size={18}/> Credenciais protegidas</h3><p>Tokens e segredos serão guardados somente no servidor/Edge Functions. Nenhuma integração externa está disparando mensagens ou criando eventos nesta versão.</p><CheckCircle2 size={18} color="#1d9167"/></div>
   </section>
  </div>
  <p className="finance-muted">Sessão: {fullName} · {role} · {branch}. Ajustes de cargos e permissões podem exigir novo login do funcionário para atualizar o menu.</p>
 </div>;
}
