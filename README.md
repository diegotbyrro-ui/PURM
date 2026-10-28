# PURM Transportes e Cargas

Site institucional aprovado. Próxima fase: definir e implementar um CRM conectado à captação de cotações.

Site: https://purm-transportes.diegotbyrro.chatgpt.site
Snapshot: 28/10/2026. Commit original do Sites: `15df01db2f0cb35b92563c622fbb06aa11391b78`.

## Estrutura

- `dist/index.html`: página completa, SVGs do mapa e diagrama, filiais e formulário.
- `dist/style.css`: identidade visual, responsividade e animações.
- `dist/app.js`: menu, escolha de data/hora, resumo de cotação e animação do caminhão.
- `dist/assets/`: imagens e logo usadas no projeto.
- `.openai/hosting.json`: vínculo com a publicação existente do Sites. Preservar a identidade.
- `CRM_CONTEXTO.md`: ponto de partida para continuar em outro chat.

O site é HTML/CSS/JavaScript estático, sem build ou dependências de aplicação. Para prévia local, execute `python -m http.server 3000 --directory dist` e abra http://localhost:3000. Uma extensão de servidor estático também serve.

## Estado funcional

O formulário monta um pedido com data e horário de contato, nome, empresa, WhatsApp, e-mail, origem, destino, peso e descrição da carga. O visitante revisa e pode copiar ou baixar o texto. Não há envio ao servidor, banco de dados, autenticação ou CRM implementados.

O ícone do WhatsApp no topo leva ao formulário; ainda falta o número comercial para direcionamento real. A seleção de data/hora é uma preferência de contato, sem consulta de disponibilidade ou reserva.

Não incluir credenciais em arquivos do site ou no GitHub. Variáveis de backend e autorização precisarão ser definidas na fase do CRM.

## Publicar no GitHub

O repositorio `diegotbyrro-ui/PURM` foi criado pelo usuario e estava vazio na verificacao de 28/10/2026. A integracao do chat recusou a gravacao com erro 403. Extraia o ZIP, abra PowerShell nesta pasta e execute `powershell -NoExit -ExecutionPolicy Bypass -File .\PUBLICAR_GITHUB.ps1`. O script copia os arquivos para uma nova pasta na Area de Trabalho, confirma que o remoto esta vazio, cria o commit, envia sem force e confirma o SHA remoto. O Git pode solicitar login pelo navegador. Se o remoto ja tiver commits, o script interrompe para preservar tudo.
