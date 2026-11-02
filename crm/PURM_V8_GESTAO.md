# PURM V8 — Gestão mensal, IA no cliente, pipeline configurável e agenda Google

## Escopo entregue

1. **Dashboard:** gráficos e comparações dos últimos 12 meses por data de criação de leads, valores cotados e estágio atual de ganhos. A aba Relatórios sai do menu; os dados do painel continuam disponíveis. Não confundir valores cotados com faturamento, e estágios atuais com datas históricas de fechamento.
2. **IA Analista por cliente:** remove-se a aba IA Analista. No modal de cada cliente/cotação há diagnóstico da IA V6 com histórico de atividades e painel de avaliação da abordagem. Inclui função protegida `purm-lead-coach-v8` e histórico de feedback, nunca envia mensagens diretamente.
3. **Pipeline:** administradores podem criar, renomear, colorir, classificar como aberta/ganha/perdida e excluir colunas vazias. As colunas têm rolagem vertical dos cards e a faixa do Kanban tem rolagem horizontal por barra/botões. Etapas com leads não podem ser apagadas.
4. **Agenda:** a aba Agenda lê eventos reais da agenda Google conectada por `events.list` e exibe mês, semana e lista; funcionários autorizados podem criar/editar/excluir eventos simples. Eventos de dia inteiro e recorrentes têm visualização, mas edição é delegada ao Google para evitar mudanças involuntárias em séries. Alterações de eventos que têm vínculo com a agenda da Secretária atualizam a tabela interna.

## Pré-requisitos e ordem de execução — MANUAL

- Backup do Supabase PURM antes do SQL. Não executar no APROVUP.
- Execute primeiro `VERIFICAR_V8.sql`. Se `IA Analista V6` estiver `PENDENTE`, revise e aplique manualmente `SQL_V6_SE_PENDENTE.sql` (somente depois de validar V3, V4 e V5).
- Aplique `crm/supabase/purm_v8_gestao.sql` no SQL Editor do PURM e repita `VERIFICAR_V8.sql`: cinco linhas `OK`.
- Extraia este ZIP e execute o PowerShell `INSTALAR_PURM_V8.ps1` (ou use `EXECUTAR_PURM_V8.ps1` separado). Ele faz checagem de HEAD, origem Git, clone backup, patch somente na cópia, npm/TypeScript, build site+CRM, solicita `SQL_V8_OK`, solicita `PUBLICAR_V8`, e só então modifica 10 arquivos, faz commit/push com confirmação do SHA remoto.
- **Depois do push**, publicar manualmente o novo endpoint `purm-calendar-v8` usando `crm/supabase/functions/purm-calendar-v8/index.ts`, e `purm-lead-coach-v8` usando `crm/supabase/functions/purm-lead-coach-v8/index.ts`. Cada um exige autenticação de usuário e RLS/permissões da PURM; no Supabase com JWT assimétrico, desative apenas a verificação JWT legada no gateway, mantendo `withSupabase({auth:'user'})` no código. Não publique as funções com auth `none`.
- Verificar deploy Hostinger `/crm/`. Não mexer na função existente `purm-google-calendar` nem no callback V7. Não mexer em DNS, correio nem site `dist/`.
- Teste com empresa fictícia sem dados sensíveis, registrando histórico e usando a IA. Teste agenda com evento de teste sem convidados externos; confirme criação, edição, exclusão e auditoria. Caso backend V8 não esteja publicado, a nova Agenda dará erro explícito e não modificará o Google.

## Segurança e limitações

- Chaves OpenAI/Google permanecem no Supabase, não em código ou logs.
- Na função de agenda, leitura exige `crm.view`, escrita exige `crm.edit`; na função de feedback, `crm.edit`. O servidor confere JWT e regras RLS. Somente administradores podem alterar pipeline (RLS SQL). O frontend apenas oculta o controle para outras funções.
- Operações de exclusão ou edição na agenda pedem confirmação. Os registros são incluídos na auditoria Google existente. Falha ao atualizar o banco interno após alterar Google exige reconciliação manual; não faça alterações repetidas sem conferir o resultado.
- Não há sincronização push automática nem webhook Google: a aba consulta a API ao abrir, mudar mês ou pressionar Atualizar. A consulta é limitada a quatro páginas de até 250 eventos por intervalo de 70 dias; calendários muito cheios podem necessitar paginação adicional.
- O campo de feedback do comercial é processado pela OpenAI e salvo para auditoria de melhoria; evite informações pessoais sensíveis. O relatório mensal mostra retrato das conversões atuais agrupadas pela entrada das cotações, não fecha historicamente cada mês sem log de transições.
- **Não conectado automaticamente ao WhatsApp; sem envio de notificações externas ou criação automática de eventos pela conversa livre do GPT nesta V8.**
- Este pacote foi verificado quanto a sintaxe TS/TSX e âncoras de integração do commit `766b9ff3c1ca9c5fd6526b4d4eb74430c62938fe`. O npm/typecheck/build reais precisam passar no computador do usuário, em cópia isolada, antes de qualquer publicação.
