import { useState, type FormEvent } from 'react';
import { Bot, MessageSquareText, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return 'Nao foi possivel completar a solicitacao.';
}

export default function CarlaAiPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!supabase || !prompt || busy) return;
    setBusy(true);
    setError('');
    setInput('');
    const previous = messages;
    const next = [...previous, { role: 'user', content: prompt } as ChatMessage];
    setMessages(next);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('purm-carla-ai', {
        body: { message: prompt, history: previous.slice(-6) },
      });
      if (invokeError) {
        // Em chamadas com HTTP >= 400, o Supabase oferece o corpo no response/context.
        let detail = invokeError.message;
        const context = (invokeError as Error & { context?: Response }).context;
        if (context && typeof context.json === 'function') {
          try {
            const payload = await context.json() as { error?: string };
            if (payload.error) detail = payload.error;
          } catch { /* Mantem o erro padrao */ }
        }
        throw new Error(detail);
      }
      const responseText = typeof data?.reply === 'string' ? data.reply.trim() : '';
      if (!responseText) throw new Error('A IA nao devolveu uma resposta valida.');
      setMessages([...next, { role: 'assistant', content: responseText.slice(0, 4000) }]);
    } catch (reason) {
      setMessages(previous);
      setInput(prompt);
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="finance-panel" style={{ marginBottom: 20 }} aria-label="Conversa com inteligencia artificial">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="carla-avatar"><Bot size={23}/></span>
          <div><h3 style={{ marginBottom: 3 }}>Carla IA — conversa com GPT</h3>
            <p style={{ marginTop: 0 }}>Assistente com respostas naturais, conectada a um backend seguro.</p></div>
        </div>
        <button type="button" className="secondary" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); }}>
          <Trash2 size={15}/> Limpar conversa
        </button>
      </div>
      <div role="log" aria-live="polite" style={{ display: 'grid', gap: 10, maxHeight: 390, minHeight: 130, overflowY: 'auto', marginTop: 14, padding: 12, background: '#f4f7fc', borderRadius: 12 }}>
        {!messages.length && <div style={{ color: '#596b81', lineHeight: 1.65 }}>
          <MessageSquareText size={20}/> Olá! Pergunte algo sobre atendimento, transportes ou organização da PURM.
          <p>Exemplo: “Carla, me ajude a organizar os próximos contatos comerciais”.</p>
        </div>}
        {messages.map((m, index) => <div key={index} style={{ justifySelf: m.role === 'user' ? 'end' : 'start', maxWidth: '90%', whiteSpace: 'pre-wrap', padding: '10px 13px', background: m.role === 'user' ? '#2868ff' : '#fff', color: m.role === 'user' ? '#fff' : '#102b4b', borderRadius: 12, overflowWrap: 'anywhere' }}>
          <strong style={{ display: 'block', fontSize: 11, opacity: 0.8, marginBottom: 4 }}>{m.role === 'user' ? 'Você' : 'Carla IA'}</strong>
          {m.content}
        </div>)}
        {busy && <div>Carla está preparando a resposta...</div>}
      </div>
      <form onSubmit={send} style={{ display: 'flex', alignItems: 'stretch', gap: 10, marginTop: 12 }}>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span className="sr-only">Mensagem para a Carla</span>
          <input type="text" required maxLength={1200} value={input} disabled={busy} onChange={e => setInput(e.target.value)} placeholder="Escreva uma pergunta para a Carla..." style={{ width: '100%' }}/>
        </label>
        <button type="submit" className="primary" disabled={busy || !input.trim()}><Send size={16}/> Enviar</button>
      </form>
      {error && <div className="finance-notice" role="alert" style={{ marginTop: 10 }}>
        {error}. Confirme a função purm-carla-ai e o segredo OPENAI_API_KEY no Supabase.
      </div>}
      <p className="finance-muted" style={{ marginTop: 12, display: 'flex', alignItems: 'start', gap: 7 }}>
        <ShieldCheck size={16} style={{ flexShrink: 0 }}/>
        A conversa é temporária neste navegador e é enviada à API da OpenAI para gerar respostas. Não inclua senhas nem dados bancários sensíveis. A IA não altera registros nem envia WhatsApp: use os formulários de confirmação abaixo para registrar ações.
      </p>
    </section>
  );
}
