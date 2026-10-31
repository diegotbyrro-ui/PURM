# PURM V7 — Google Agenda corporativo

## Aprovado/preparado antes desta versão
- Google Auth Platform PURM CRM em Produção (a verificacao Google pode continuar pendente).
- Cliente OAuth tipo Aplicativo da Web; callback exato:
  `https://nswjifgyyfgdmzczxgkw.supabase.co/functions/v1/purm-google-calendar-callback`
- Secrets ja cadastrados: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

## Passos obrigatorios e manuais — nao realizados pelo instalador
1. Gerar e salvar o quarto secret `PURM_GOOGLE_TOKEN_KEY` (base64 de 32 bytes). NAO mostrar no chat ou commit. Exemplo PowerShell:
   `$bytes = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); [Convert]::ToBase64String($bytes) | Set-Clipboard`
   Cole o resultado diretamente no valor do secret no Supabase. Nao altere o valor depois de conectar: invalidaria tokens criptografados.
2. Aplicar manualmente `crm/supabase/google_calendar_v7.sql` no SQL Editor PURM, apos backup.
3. Em Edge Functions do Supabase, criar/publicar `purm-google-calendar` usando arquivo `index.ts` da pasta com o mesmo nome. JWT legacy ON para usuarios (ajustar se projeto usar assinaturas novas).
4. Criar/publicar `purm-google-calendar-callback` com seu `index.ts`. **Verify JWT with legacy secret OFF somente nesta funcao**, porque o Google retorna sem JWT. A funcao verifica `state` one-time, expiracao e PKCE.
5. Hostinger/GitHub: publicar frontend da V7 pelo instalador apenas apos confirmacao e build.
6. Abrir `https://purm.com.br/crm/` → Configuracoes → Google Agenda → Conectar. Autorizar a conta Google corporativa proprietaria da agenda primaria.
7. Se receber aviso de app nao verificado, rever Google Auth Platform. Nao publicar ate revisar permissao e impacto; producao nao implica verificacao.
8. Testar criação de compromisso por Secretária; verificar o mesmo evento no Google e no CRM; excluir apos confirmacao, conferir historico.

## Limites e protecoes
- Uma agenda Google corporativa compartilhada por todo o CRM (a conta administradora autorizada).
- Usada permissao Google `calendar.events.owned` apenas para agendas da qual a conta e proprietaria. Se a conta nao for proprietaria, a API pode recusar.
- OAuth com state de uso unico, expiracao 10 min e PKCE; callback publico valida ambos; token de atualizacao armazenado com AES-256-GCM sob secret protegido no backend.
- Sem tokens, senhas ou Client Secret no navegador ou no GitHub.
- Apenas admin conecta/desconecta. Equipe com `secretary.use` pode criar/excluir com confirmacao. Auditoria permanente de acoes.
- Google popup reminders de 1440/60 minutos; **nao** notificacoes WhatsApp nem tarefa cron.
- Operacoes de agenda so acontecem por acao confirmada; chat GPT nao recebe ferramentas de Google automaticamente nesta V7.
- Sync cria Google ID deterministico por evento interno; retries evitam duplicacoes comuns.
- Se criar em Google e falhar atualizar Supabase, repita Sync; ao excluir, verifique o resultado. Erros sao exibidos na UI.
- Secrets nao sao copiados do Google para GitHub. Backup de banco e teste de account consent devem ocorrer antes de publicar em producao.
- Nenhuma funcao, SQL ou segredo sera ativado pelo instalador Git.
