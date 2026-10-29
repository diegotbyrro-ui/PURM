# PURM V2 — Financeiro + Secretária Carla (primeira entrega)

Origem de referência: APROVUP `src/app/(dashboard)/financas/page.tsx`, `src/lib/cardStatementParser.ts`, `src/app/(dashboard)/financas/cartoes/CardStatementsClient.tsx`, `src/lib/secretaryFinance.ts`, `src/app/(dashboard)/secretaria/SecretaryClient.tsx`. Implementação independente, adaptada ao CRM PURM (React/Vite + Supabase).

## Recursos incluídos
- Novas abas **Financeiro** e **Secretária Carla** no menu existente (somente admin/gestor).
- Registros de receita, despesa, transferência de entrada e saída; status pendente ou liquidado; período de competência, vencimento e forma de pagamento.
- Indicadores separados de competência, contas em aberto e movimentação de caixa; não representa saldo bancário sem saldo inicial.
- Baixa manual de contas pendentes; exportação CSV local.
- Importação com **prévia editável e seleção** de CSV/TSV/TXT/OFX/QFX/QBO, por cartão ou conta; categorias por regras e prevenção de duplicatas via índice único.
- Compra de cartão é despesa por competência sem efeito imediato de caixa; pagamento da fatura deve ser lançado como `transfer_out` para refletir saída financeira sem somar despesa outra vez.
- Carla V2 interpreta regras limitadas, gera **rascunho editável** de despesa/receita e compromisso; persiste somente com confirmação explícita.
- Compromissos ficam na agenda interna PURM, com link para abrir o cadastro manual do Google Agenda e preferências de lembretes 1 dia/1 hora.
- Tabelas de banco exclusivas, RLS para `admin`/`gestor` e auditoria financeira via trigger.

## NÃO implementado nesta entrega
- **Importação PDF**, inclusive imagens/PDF digitalizado. Exportar CSV ou OFX por enquanto; PDF requer extrator e testes por banco. O seletor informa isso.
- **Integração automática Google Calendar**: requer OAuth, tokens protegidos no backend, consentimento e sincronização.
- **Avisos 1 dia e 1 hora antes de forma proativa**: requer processo de servidor/cron com deduplicação e provedor de mensagens. A V2 apenas registra preferências.
- **IA conversacional generativa/WhatsApp**: Carla V2 é interpretador de frases estruturadas com confirmação; não é a LIV completa e não escuta WhatsApp.
- Conciliador completo com saldo bancário real, parcelamento/contas recorrentes, conciliação de transferência e importação universal de bancos.
- Envio de mensagens, migrations automáticas, seed ou alteração de credenciais.

## Implantação controlada
1. Instale os arquivos V2 com o instalador PowerShell fornecido. O script verifica HEAD/remoto/branch/arquivos locais, valida hashes, gera backup e faz staging somente nos arquivos autorizados. Compila em cópia isolada, cria commit/push e confirma HEAD remoto. Não executa SQL.
2. **Revise e execute manualmente** `crm/supabase/finance_secretary_v2.sql` no SQL Editor do projeto Supabase da PURM, ANTES de utilizar as novas abas. Nunca use no APROVUP. Recomendado backup do banco antes.
3. A Hostinger deve receber o novo commit por GitHub. Se deploy automático não ocorrer, redeploy pela Hostinger, mantendo variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY existentes.
4. Faça testes com dados fictícios, preferencialmente em ambiente de teste, antes de cadastrar transações reais.
5. Confira no painel Supabase: tabelas `purm_finance_entries`, `purm_finance_audit`, `purm_secretary_events`, RLS ativo. Usuários de perfil `comercial` não acessam dados financeiros.
6. Teste uma despesa pendente, uma receita liquidada, uma fatura CSV com 2 linhas, reimportação (duplicata ignorada), uma despesa por Carla e um compromisso interno.

## Sobre o parser de extrato
O arquivo original é lido no navegador e **não é carregado ao Supabase**. Os lançamentos selecionados, depois de confirmação, são gravados. Bancos possuem formatos diferentes; valores, sinais e totais devem sempre ser conferidos antes da importação. Não importar faturas com dados pessoais sem autorização; não fazer upload de arquivos bancários reais ao chat.

## Segurança
Não existem chaves service_role, client_secret ou tokens no código. A RLS da nova tabela limita aos membros admin/gestor. Uma instância compartilhada do Supabase pode permitir que admins de filiais vejam os mesmos dados; implantar segregação por filial antes do uso descentralizado. Operações de escrita não são executadas pela Carla sem confirmação do usuário.

## Próximo marco recomendado
1. PDF de cartões e extratos via PDF.js com parser específico por instituição e testes de regressão;
2. Google OAuth 2.0 no servidor (Supabase Edge Functions), tokens criptografados, criação/edição de evento com consentimento e logs;
3. Agendador de alertas D-1 e H-1 com idempotência, deduplicação, opt-in e canal autorizado;
4. Permissões por filial, conciliação, faturas/cartões e receitas recorrentes.
