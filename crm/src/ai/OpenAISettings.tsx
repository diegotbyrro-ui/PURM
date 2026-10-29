import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, LockKeyhole, RefreshCw, ShieldAlert } from 'lucide-react';
import { supabase } from '../supabase';

export default function OpenAISettings(){
 const [key,setKey]=useState('');
 const [configured,setConfigured]=useState<boolean|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [show,setShow]=useState(false);
 async function check(){if(!supabase)return;setBusy(true);
  try{
   const {data,error}=await supabase.functions.invoke('purm-ai-settings',{body:{action:'status'}});
   if(error)throw error;
   setConfigured(data?.configured===true);
   setMessage('');
  }catch{setConfigured(null);setMessage('O gerenciador de chaves ainda nao foi ativado no Supabase. Execute SQL V5 e publique a funcao purm-ai-settings.');}
  finally{setBusy(false);}
 }
 useEffect(()=>{void check();},[]);
 async function save(e:FormEvent){e.preventDefault();if(!supabase||busy)return;
  if(!/^sk-[A-Za-z0-9_-]{20,300}$/.test(key.trim())){setMessage('Cole a chave completa obtida na plataforma OpenAI.');return;}
  setBusy(true);setMessage('');
  try{
   const {data,error}=await supabase.functions.invoke('purm-ai-settings',{body:{action:'set',key:key.trim()}});
   if(error||data?.configured!==true)throw new Error('Falha ao salvar no cofre seguro.');
   setConfigured(true);setKey('');setShow(false);setMessage('Chave salva de forma criptografada no Supabase Vault. A funcao de IA precisa estar publicada para responder.');
  }catch{setMessage('Nao foi possivel salvar. Confirme a funcao purm-ai-settings e o SQL V5 no Supabase.');}
  finally{setBusy(false);}
 }
 return <section className="admin-connection" aria-label="Configurar API da OpenAI">
   <h3><KeyRound size={18}/> Integração OpenAI — GPT</h3>
   <div className="ai-status-row"><span className={configured?'ai-connected':'admin-status'}>
     {configured?<><CheckCircle2 size={14}/> Chave cadastrada</>:configured===false?'Chave não cadastrada':'Configuração não verificada'}
   </span><button type="button" className="secondary" onClick={()=>void check()} disabled={busy}><RefreshCw size={14}/> Verificar</button></div>
   <p>Aqui o administrador cadastra ou substitui a chave usada pela Secretária. A chave é enviada ao servidor e armazenada criptografada no Supabase Vault; nunca será exibida novamente.</p>
   <form onSubmit={save} className="ai-key-form" autoComplete="off">
     <label htmlFor="purmOpenaiKey">Chave API OpenAI</label>
     <div className="ai-key-input"><input id="purmOpenaiKey" type={show?'text':'password'} autoComplete="new-password" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-proj-..." maxLength={350} aria-label="Chave privada da API OpenAI"/><button type="button" className="secondary" onClick={()=>setShow(x=>!x)}>{show?'Ocultar':'Mostrar'}</button></div>
     <button type="submit" className="primary" disabled={busy||!key.trim()}><LockKeyhole size={16}/> {busy?'Processando...':'Salvar chave com segurança'}</button>
   </form>
   {message&&<p role="status" className="ai-settings-message"><ShieldAlert size={15}/>{message}</p>}
   <p>Crie a chave em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com/api-keys</a>. Não use uma senha do ChatGPT e não coloque a chave em variáveis VITE_ da Hostinger.</p>
   <p>Se este painel ainda não conectar, a função <strong>purm-ai-settings</strong> e o SQL V5 precisam ser ativados manualmente no Supabase. A função <strong>purm-carla-ai</strong> também precisa estar implantada.</p>
 </section>;
}
