# PURM V3 — Equipe, permissões, identidade e alertas da Secretária

## O que está implementado

- Aba Configurações (admin): listar e vincular **usuários já criados no Supabase Authentication**, cargos `admin`, `gestor`, `comercial` e `financeiro`, filial e matriz de permissões. O vínculo é feito por RPC protegida `purm_admin_save_member`, não por código no navegador que tenta escrever em `auth.users`.
- Permissões armazenadas na tabela de membros e aplicadas **também pelas políticas RLS** de CRM, Financeiro e agenda interna. Não há permissão de apagar registros financeiros.
- Nome e foto da Secretária editáveis no painel. Foto enviada a bucket de imagens públicas do próprio Supabase, limitada a JPEG/PNG/WEBP de 2 MB. O usuário pode informar o número comercial em metadados.
- Campo de responsável em cada cotação. Novo lead cadastrado no CRM cria notificação interna para o responsável ou, sem responsável, para administradores. Sino no topo atualiza a cada 45 segundos enquanto a página estiver aberta; marcar como lido e abrir lead.
- Novo SQL com políticas, funções, bucket de foto e triggers, aplicado **manualmente** depois de backup no projeto Supabase exclusivo da PURM.
- Cartões de configuração Google Agenda e WhatsApp Cloud API mostram o status real **Não conectado** e acesso às respectivas plataformas. Sem tokens expostos.

## O que ainda NÃO está conectado

- **WhatsApp Cloud API:** não há webhooks, ingestão de conversas, envio de avisos a funcionários fora do navegador, perfil WhatsApp atualizado pela Meta, chatbot externo ou comunicação automática com clientes. A chave de acesso e o `app secret` serão armazenados somente em segredos de Edge Functions. Enviar templates aprovados pode exigir opt-in e cobrança.
- **Google Agenda:** não há OAuth concluído, criação sincronizada de eventos nem alerta D-1 / H-1. Requer conexão consentida com Google, refresh token guardado no backend e agendamento seguro.
- **Site de cotações:** o formulário institucional atual apenas gera resumo. Não cria leads no banco; quando integrarmos via endpoint protegido/rate limit, as notificações também cobrirão leads do site.
- **Criação automatizada de contas:** o administrador primeiro cria a conta em `Supabase → Authentication → Users → Add user` e depois autoriza no painel PURM. Convite direto via Edge Function ficará para V4.

## Ordem segura de implementação

1. Confirmar backup do projeto Supabase PURM. Revisar e executar **somente no Supabase PURM** `crm/supabase/team_carla_v3.sql`. Verificar que o administrador continua com `admin` e seis permissões.
2. Instalar V3 via PowerShell/ZIP, em repositório limpo e HEAD `9e5a162337be4ce88acd76a917d3e78179576efd`. Validar TypeScript e build; commit/push apenas dos arquivos da V3; verificar SHA do push.
3. Verificar no deploy Hostinger `levelupbackup.com.br/crm/`: configurações, cadastro de usuário teste pelo Auth + painel, abas permitidas, foto e sino de avisos. Não colocar token/secret em campo do frontend.
4. Testar lead fictício com responsável; confirmar notificação, persistência, acesso financeiro restrito a role/permissão.
5. Preparar um projeto Google Cloud: habilitar Calendar API, configurar tela de consentimento e cliente OAuth Web com redirecionamento **exato para endpoint Edge Function ainda a ser implementado**, escopo mínimo `calendar.events`. Nunca colar client secret na Hostinger como VITE_*. Após criar endpoint, registrar o callback no Google Cloud.
6. Preparar Meta Developers / WhatsApp Business: conferir titularidade da WABA, número destinado à PURM, Phone Number ID, Webhook e necessidade de templates. Não ativar envio antes de fluxo seguro, verificação de webhook, auditoria e permissão do destinatário.
7. Implementar em versão posterior Edge Functions para Google OAuth, recepção WhatsApp com validação de assinatura, filas idempotentes de alertas e cron D-1/H-1. Somente depois da validação habilitar envios.

## Observações de segurança

- Todas as filiais compartilham o banco na V3 e membros autorizados podem ver todos os leads da empresa. `branch` é metadado; isolamento por filial exige políticas adicionais antes do uso descentralizado.
- Usuário `financeiro` não vê leads, salvo autorização explícita. Usuário `comercial` não tem acesso financeiro, salvo autorização explícita. Administradores têm permissão total e não podem remover o próprio cargo no painel.
- Foto do perfil da secretária no CRM **não atualiza automaticamente a foto do número WhatsApp Business**. A imagem pública é preparada como asset; a alteração do perfil depende da Meta.
- Nenhum token Google ou Meta, nenhuma senha e nenhum arquivo de fatura é salvo no GitHub.
- O SQL inclui substituição de políticas RLS V1/V2 específicas para restringir módulos. Revise antes de rodar; o script PowerShell **nunca** executa SQL, seed ou migrations automaticamente.
