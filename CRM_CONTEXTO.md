# Continuidade — CRM PURM

## Pedido do usuário

O site foi aprovado. O usuário quer levar o código ao GitHub e continuar em outro chat para montar um CRM. O escopo do CRM ainda não foi definido; os itens abaixo são sugestões para descoberta, não recursos já aprovados ou implementados.

## Preservar o site aprovado

Identidade azul elétrico, azul-marinho e branco. Abertura com caminhão original; caminhão da doca com plotagem PURM. Mapa do Brasil com pino PURM em Recife e pontos partindo para capitais; diagrama claro com logo e RECIFE na origem. Botão de WhatsApp no topo. Caminhão do botão circular acelera para fora da página ao passar o mouse.

Filiais com cards azul-marinho, mapas Google incorporados, siglas BA/CE em contorno e botão Traçar rota. Logos foram ampliadas para 60px com margem para evitar cortes.

- Filial Salvador: Av. Elmo Serejo de Farias, 3872 – CIA 1, Simões Filho – BA, CEP 43700-000. Não trocar a cidade física por Salvador no endereço.
- Filial Fortaleza: R. Augusto Benevides, 999 – Parque Santa Maria, Fortaleza – CE, CEP 60873-065.

## Lacunas atuais

- Nenhum lead é enviado ou persistido; nenhum backend existe.
- WhatsApp comercial ainda não foi fornecido.
- Data/hora não representa agendamento confirmado.
- Não há usuários internos, permissões, funil, histórico ou painel.
- O site permanece publicado no Sites. O upload ao GitHub não transfere automaticamente sua hospedagem.

## Próxima conversa

Começar confirmando o fluxo comercial e quem usará o CRM. Sugestão inicial: captação de leads/cotações do site, cadastro de empresas e contatos, funil com responsáveis, origem/destino/carga, histórico de contatos, tarefas e preferência de data/hora. Definir etapas do funil, papéis por filial e regras de acesso antes da implementação. Definir stack, banco, autenticação, hospedagem e como o site irá enviar os pedidos.

Não inventar CNPJ, frota, SLA, preços, contatos ou contratos. Preservar o layout aprovado e fazer alterações de integração pontuais. Não expor dados do futuro CRM no site público. Validar autorização no servidor.

## Texto para abrir o novo chat

“Vamos continuar o projeto PURM. O site institucional está aprovado; preserve o layout. Leia README.md e CRM_CONTEXTO.md do repositório ou do ZIP anexado. Quero definir e construir um CRM para a transportadora, integrando a captação de cotações do site. Primeiro inspecione o código atual e alinhe comigo o fluxo comercial, usuários, permissões e etapas do funil. O formulário atual apenas prepara um texto; ainda não envia nem salva leads.”
