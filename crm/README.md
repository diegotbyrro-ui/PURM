# PURM CRM — base visual inspirada no CRM APROVUP

Aplicação independente em React/TypeScript/Vite com identidade visual PURM, sidebar, KPIs, Kanban arrastável, formulários, agenda, relatórios e histórico. Utiliza Supabase **exclusivo** para a PURM com RLS. Não reutiliza usuários ou tabelas do APROVUP.

## Situação
- O frontend CRM fica em `crm/` e **não substitui** `dist/` do site institucional aprovado.
- A interface e operações CRUD trabalham com dados reais somente após configurar Supabase e habilitar permissões.
- Sem credenciais, o sistema exibe uma tela de configuração, e não inventa dados comerciais.
- **Não há envio do formulário público ao CRM nesta versão.** Integrar somente após API protegida, antispam, consentimento e testes.
- SQL em `supabase/schema.sql` para **revisão e execução manual** em banco exclusivo. Nenhuma migração é executada por scripts.

## Como executar
1. Crie um NOVO projeto Supabase dedicado à PURM (não use o banco APROVUP).
2. Revise `supabase/schema.sql` e execute manualmente no SQL Editor deste projeto, em uma implantação controlada.
3. Cadastre os funcionários pelo Supabase Auth (o CRM não permite cadastro público); adicione seus `user_id` manualmente à tabela `purm_crm_members`. Use a função SQL documentada ao final do schema para criar a lista de etapas.
4. Copie `.env.example` para `.env.local` e informe `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do projeto PURM. **Nunca coloque a service_role key no frontend.**
5. Na pasta `crm`, execute `npm install`, `npm run typecheck`, `npm run build` e `npm run dev`.
6. Publique o CRM em hospedagem separada (ex.: subdomínio administrativo), obrigatoriamente sob HTTPS e com Auth/RLS habilitados. `build/` é o resultado do Vite.

## Limites da primeira versão
- Cadastro/login controlado pelo administrador Supabase; não implementa convite de usuários nem redefinição administrativa.
- A tela de Configurações exibe permissões existentes, mas não permite alterá-las.
- A agenda usa o campo `next_contact_at`; o histórico de atividades é registrado separadamente.
- Sem anexos, notificações automatizadas, disparo de WhatsApp, precificação de frete, nem rastreamento operacional nesta fase.
- A conta deve estar previamente habilitada em `purm_crm_members` para acessar qualquer dado. RLS é obrigatório e não pode ser desativado.
- O acesso cliente-Supabase requer configuração adequada de CORS, HTTPS, política de senha, MFA conforme risco e revisão de segurança antes de dados de produção.

## Modelo de origem
Referência consultada em 28/10/2026: `diegotbyrro-ui/aprovup`, branch `main`, componente `src/components/sales-os-original/crm/crm-board.tsx`, página `src/app/(sales)/crm/pipeline/page.tsx`, sidebar `SalesOsSidebar.tsx` e tema `aprovup-theme.css`. Trata-se de uma **adaptação** visual/funcional para a PURM, não transplante literal das dependências ou do banco do APROVUP.
