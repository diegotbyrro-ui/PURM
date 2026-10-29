# PURM V5 — Nome editavel + OpenAI segura

1. **SQL:** faca backup do banco da PURM e execute manualmente `supabase/carla_ai_settings_v5.sql`. Se o Supabase Vault nao estiver ativado, habilite a extensao antes; o SQL falha de forma segura.
2. **Functions:** publique (ou atualize) as funcoes `purm-ai-settings` e `purm-carla-ai` atraves do Supabase Edge Functions. Mantenha autenticacao obrigatoria.
3. **Configurações:** no CRM, altere `Nome da Secretária` e salve. O nome aparecerá no menu, financeiro, chat GPT e mensagens. O nome anterior padrao Carla é substituido por Assistente via SQL (somente se ainda for exatamente Carla).
4. **API:** no painel Configuracoes > Integracao OpenAI — GPT, cole a chave criada em https://platform.openai.com/api-keys e clique em Salvar. O front envia a chave sobre TLS ao backend autenticado, que a grava no Vault. Nao ha chave em GitHub, logs ou bundle.
5. **Validação:** abra Secretaria > mensagem GPT. A chave salva pode substituir o secret de ambiente da V4. Se ainda houver `OPENAI_API_KEY` no ambiente, ele funciona como fallback.
6. **WhatsApp e Google:** continuam nao conectados; nao ha envio externo nem automacao nessa versao.

Seguranca: o acesso ao gerenciador de chave requer cargo `admin` verificado no backend, e a RPC de Vault so e executavel por `service_role`. O cliente nunca recebe a chave ao consultar status. A chave nao e validada por chamada paga no momento do cadastro; teste uma pergunta depois.

**Nao execute migrations nem envie mensagens com o PowerShell.**
