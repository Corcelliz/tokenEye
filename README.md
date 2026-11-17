# Dashboard de Tokens

Aplicativo desktop (Electron + HTML/CSS/JS puros, Windows) que mostra ao vivo o consumo de tokens do Claude, lendo os logs locais do Claude Code em `~/.claude/projects/**/*.jsonl`. Só metadados de uso são lidos; o conteúdo das conversas nunca é acessado, guardado ou exibido.

## Como rodar

```bash
npm install
npm test            # testes do parser e da agregação
npm start            # abre a janela do app
npm run smoke        # abre, confere que carregou sem erro e fecha sozinho
npm run screenshot   # gera um PNG com dados ficticios em docs/screenshots/
npm run prova-leitura  # soma os tokens de hoje direto dos logs, para conferencia independente
```

> **Se `npm run smoke` ou `npm start` falhar com `Cannot read properties of undefined (reading 'disableHardwareAcceleration')`:** o terminal tem a variável `ELECTRON_RUN_AS_NODE` definida (alguns programas a definem), e ela faz o Electron rodar como Node puro. Rode sem ela: `env -u ELECTRON_RUN_AS_NODE npm start` (Git Bash) ou `Remove-Item Env:ELECTRON_RUN_AS_NODE` antes (PowerShell).

## Limites do plano (sessão de 5 h e semana)

### Automático, pela linha de status do Claude Code

O Claude Code recebe da Anthropic os percentuais **oficiais** de uso da assinatura e os entrega ao script da linha de status (campo `rate_limits`). O `scripts/statusline.js` pega **só** esses números, grava em `%APPDATA%\dashboard-tokens\limites-auto.json` e mostra `sessão 36% · semana 66%` embaixo do Claude Code. O app observa esse arquivo e atualiza as barras sozinho (selo "automático"). O app continua sem rede e sem ler credenciais.

- **Para funcionar em qualquer pasta**, adicione ao seu `~/.claude/settings.json`, trocando o caminho pelo da pasta do projeto (com barras `/`):

```json
"statusLine": {
  "type": "command",
  "command": "node \"C:/caminho/para/dashboard-tokens/scripts/statusline.js\""
}
```

Limitações: os números só se renovam enquanto você usa o Claude Code (o percentual é da conta toda, então inclui o uso no claude.ai, mas só chega quando o Claude Code faz uma chamada). Quando a janela de 5 h ou da semana reinicia, a barra mostra "Reiniciou · aguardando o Claude Code" até a próxima leitura.

**Se a barra não atualiza sozinha:** abra `%APPDATA%\dashboard-tokens\statusline-ultima-chamada.json`. Se o arquivo não existe, o Claude Code nunca chamou o script (a linha de status só roda onde o Claude Code a exibe, e a configuração só vale para sessões iniciadas depois dela). Se existe com `"trouxeLimites": false`, o Claude Code chamou, mas não mandou os percentuais (eles só chegam para assinaturas com limite e depois da primeira resposta). O arquivo guarda só os nomes dos campos recebidos, nunca os valores.

### Estimativa automática, quando não chega o percentual oficial

Nem sempre o Claude Code manda o `rate_limits` para a linha de status (por exemplo, o app desktop pode não mandar). Para a barra não ficar parada na última leitura, o app **estima** o valor: pega a última leitura (manual ou automática), calcula quantos % cada token valeu naquela janela e aplica a mesma taxa aos tokens novos dos logs (entrada + saída). A sessão usa blocos de 5 h; a semana usa os últimos 7 dias. A barra mostra "~" antes do número e o selo "estimado". Limitações: não enxerga o uso no claude.ai nem os pesos exatos de cada modelo, e a semana não percebe sozinha o reinício. Qualquer leitura oficial ou colada depois substitui a estimativa.

### Manual, como reserva

Se passar um tempo sem usar o Claude Code, clique em **Atualizar** no cartão e cole o texto copiado de **Configurações → Uso** no claude.ai (do "Sessão atual" até "Esta semana"). Se o texto não for reconhecido, o app abre campos para preencher à mão. As leituras manuais ficam em `limites.json`, com histórico. Em cada barra vale a leitura mais recente, automática ou manual.

### Alerta

A barra fica amarela a partir de 80% e vermelha a partir de 95%, com ícone e texto. Para mudar, edite `"alerta": { "atencao": 80, "critico": 95 }` em `%APPDATA%\dashboard-tokens\limites.json` (o arquivo é criado na primeira leitura manual; se não existir, crie com `{ "alerta": { "atencao": 80, "critico": 95 } }`).

## Estrutura

```
src/
  main/        processo principal do Electron (leitura de logs, agregacao, janela)
  renderer/    interface (HTML/CSS/JS puros)
fixtures/      logs e limites FICTICIOS usados nos testes (nunca dados reais)
test/          testes automatizados (node:test)
scripts/       scripts auxiliares (prova de leitura, smoke test, screenshot)
docs/screenshots/  capturas de tela geradas por `npm run screenshot` (dados ficticios)
```

## Privacidade e segurança

- Le somente `~/.claude/projects/**/*.jsonl` e somente metadados de uso (tokens, modelo, horario, pasta do projeto, id da sessao).
- Nunca le `.credentials.json`, `settings.json`, `history.jsonl` ou qualquer arquivo de credenciais.
- Sem rede, sem telemetria, sem CDN. Electron com `contextIsolation`, `sandbox` e `nodeIntegration: false`.
