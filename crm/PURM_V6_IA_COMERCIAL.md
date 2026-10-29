# PURM V6 - Prospector IA e IA Analista

**Origem da arquitetura:** APROVUP Sales OS: `/crm/prospector` usa busca web + score + lista de exclusao + cadastro revisado; `/crm/ia` e painel de lead trabalham com historial e recomendacoes, pontos fortes de venda e mensagem sugerida.

**Adaptações PURM:** embarcadores, cargas, rotas, cadência, status de cotação e qualidade do atendimento. O sistema não inventa preços, contatos, disponibilidade e fretes. Os dados devem ser revisados manualmente.

## Antes da implantação

1. Confirme que o banco PURM V3, o limitador `purm_ai_allow_call()` da V4 e Vault V5 `purm_ai_secret_v5(text,text)` estão instalados. O SQL V6 confere estas dependências.
2. Faça backup do projeto Supabase PURM. Revise e execute manualmente `crm/supabase/sales_ai_v6.sql`. Isso não é feito pelo PowerShell.
3. Publique manualmente no Supabase Edge Functions a função `purm-sales-ai` com o conteúdo de `crm/supabase/functions/purm-sales-ai/index.ts`, mantendo verificação JWT ativa. Consulte as instruções do Supabase para `@supabase/server@1`.
4. Em Configurações do CRM, cadastre a chave OpenAI no backend V5, cuja função `purm-ai-settings` deve estar publicada. Não coloque chave no GitHub, Hostinger ou em variáveis VITE_ nem envie em mensagens.
5. Confira o modelo e os créditos em plataforma OpenAI. Configuração opcional `PURM_OPENAI_MODEL` nos secrets da Edge Function, padrão `gpt-4.1-mini`. A pesquisa web consume chamadas pagas.
6. Faça testes com empresas e dados fictícios ou não sensíveis. Teste login comercial e financeiro (sem acesso ao CRM), duplicatas, bloqueios e limites de consumo.

## Escopo real da V6

- Duas abas novas no menu, acessíveis a `crm.view`; geração e escrita dependem de `crm.edit`.
- Pesquisa via OpenAI Responses API com `web_search`, até 8 empresas por consulta, fontes publicas, identificação de decisor/canais profissionais, pontuação indicativa, bloqueio e registro manual no pipeline.
- Análise de lead existente usando histórico de até 12 interações (com e-mails e telefones removidos do conteúdo do prompt), resumo, score, objeções, abordagem, mensagem de WhatsApp **apenas para copiar**, próximo passo e histórico de relatórios no Supabase.
- Não há importação de leads em massa, mensagens automáticas, Google Agenda ou WhatsApp API ativa.
- As estimativas de carga e frequência, score e intenção são hipóteses. Nenhuma empresa ou contato pode ser tratado como confirmado sem validação de fonte.
- As permissões RLS controlam o acesso aos relatórios e bloqueios; a escrita de análises é realizada apenas pelo backend após confirmação da permissão.

## Diagnóstico seguro (somente leitura)
```sql
SELECT 'Limitador V4' AS componente, to_regprocedure('public.purm_ai_allow_call()') IS NOT NULL AS pronto
UNION ALL SELECT 'Vault V5', to_regprocedure('public.purm_ai_secret_v5(text,text)') IS NOT NULL
UNION ALL SELECT 'Bloqueios V6', to_regclass('public.purm_prospect_blocklist') IS NOT NULL
UNION ALL SELECT 'Analises V6', to_regclass('public.purm_lead_ai_analyses') IS NOT NULL;
```

Nota: a publicacao GitHub da V6 modifica apenas codigo e arquivos SQL de referencia; as novas funcionalidades dependem da ativação manual no Supabase. Não executar novamente os scripts antigos V3.
