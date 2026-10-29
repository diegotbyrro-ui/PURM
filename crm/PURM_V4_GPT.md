# PURM V4 — Carla GPT (primeira integração)

## Incluído
- Conversa com GPT dentro da aba **Secretária Carla**. Permissão existente `secretary.use` obrigatória.
- Edge Function `purm-carla-ai`, com autenticação de usuário, consulta da permissão e limitação de 6 chamadas/minuto por usuário.
- Usa **OpenAI Responses API** no Supabase, modelo inicial `gpt-4.1-mini` (ajustável pelo segredo `PURM_OPENAI_MODEL`).
- Mensagens enviadas à OpenAI para gerar respostas; app não guarda conversas em tabela. `store:false` na API, sem promessa de retenção zero.
- Não salva finanças, não cria eventos, não fala pelo WhatsApp e não busca dados corporativos automaticamente. A V3 mantém confirmação de lançamentos e compromissos.

## Passos separados de ativação
1. O instalador PowerShell publica o código no GitHub, após backup, validacao TypeScript/build e confirmação explícita `PUBLICAR_V4`. Não executa SQL, deploy de function, envio externo nem altera segredos.
2. Revisar e executar **manualmente** `crm/supabase/carla_ai_v4.sql` no SQL Editor da PURM. A função usa `purm_can('secretary.use')` da V3.
3. Obter uma API key em https://platform.openai.com/api-keys. **A assinatura ChatGPT não paga créditos da API.** Configure limites de gasto na plataforma OpenAI.
4. Supabase PURM → Edge Functions → Secrets: criar `OPENAI_API_KEY` com essa chave. **Não** enviar ao chat, colar no GitHub, nem colocar em `.env` VITE_* na Hostinger. Opcional: `PURM_OPENAI_MODEL` = `gpt-4.1-mini`.
5. Supabase PURM → Edge Functions → Deploy new function → `purm-carla-ai` com o código em `crm/supabase/functions/purm-carla-ai/index.ts`. Para chamadas do painel, mantenha a autenticação de usuários habilitada. É preciso que a plataforma aceite JWTs de usuário.
6. Recarregue https://levelupbackup.com.br/crm/ → **Secretária Carla**, e converse no painel IA.

## WhatsApp: próxima etapa (não conectado)
- Meta Business: app com WhatsApp Cloud API, número empresarial, WABA/Phone Number ID, token de acesso protegido e webhook público assinado com app secret.
- WhatsApp e usuários internos exigem verificação do número, consentimento e templates aprovados para mensagens proativas fora da janela aplicável.
- Integração em servidor compartilhando o núcleo de prompts e regras de permissão, idempotência, logs, opt-in e respostas apenas aos números autorizados.
- Google Calendar: OAuth e agendamento de lembretes exigem outra Edge Function e segredos específicos.

## Segurança e limitações
- Nenhuma chave privada no frontend ou no GitHub.
- Chamada de IA para suporte informativo; resultados não podem ser usados como recibos ou comprovantes.
- O parser atual da Carla V3 continua sendo o único caminho para rascunhar ações e exige confirmação antes de gravar.
- O limite de 6/minuto não é um orçamento financeiro; configure limite de gastos no provedor.
- A UI fica visível após o deploy do CRM, mas a IA só responde quando o SQL, o secret da OpenAI e a Edge Function estiverem configurados.
