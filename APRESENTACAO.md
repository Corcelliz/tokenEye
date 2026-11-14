# Dashboard de Tokens

Aplicativo desktop para Windows que mostra, ao vivo, quantos tokens do Claude você está consumindo. Ele lê os logs locais do Claude Code e transforma isso em números e gráficos simples de acompanhar.

Projeto de estudo, feito com Electron e HTML/CSS/JavaScript puros, sem frameworks.

## O que ele mostra

- **Cartões de consumo:** total de tokens de hoje, dos últimos 7 dias e do mês.
- **Gráfico dos últimos 14 dias**, com os dias contados no fuso `America/Sao_Paulo`.
- **Divisão por modelo**, com o percentual de cada um.
- **Modo ao vivo:** o painel atualiza sozinho enquanto você usa o Claude Code, sem recarregar.
- **Limites do plano:** barras de uso da sessão de 5 horas e da semana, lidas automaticamente pela linha de status do Claude Code ou coladas manualmente. Ficam amarelas a partir de 80% e vermelhas a partir de 95%.
- **Estados de tela:** carregando, vazio e erro.

## Como funciona

1. O app lê os arquivos `~/.claude/projects/**/*.jsonl`, só a parte nova de cada arquivo, usando a posição em bytes onde parou da última vez.
2. Cada linha é interpretada por um parser que guarda apenas metadados de uso: tokens, modelo, horário, id da sessão e pasta do projeto.
3. Linhas repetidas são descartadas pelo `message.id`, para não contar o mesmo uso duas vezes.
4. Os totais são somados por dia, semana, mês e modelo e enviados para a interface.
5. Um observador de arquivos avisa quando o log cresce, e a tela é atualizada em lotes.

## Privacidade e segurança

- Lê somente `~/.claude/projects/**/*.jsonl` e apenas metadados de uso. **O conteúdo das conversas nunca é lido, guardado ou exibido.**
- Nunca abre arquivos de credenciais, configurações ou histórico.
- Sem rede, sem telemetria e sem CDN: fontes e bibliotecas são locais, instaladas pelo npm.
- Electron configurado com `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, política de segurança de conteúdo (CSP) restritiva e navegação externa bloqueada.
- Os testes usam apenas dados fictícios, em `fixtures/`.

## Tecnologias

| Parte | Escolha |
| --- | --- |
| Aplicativo desktop | Electron |
| Interface | HTML, CSS e JavaScript puros |
| Observação de arquivos | chokidar |
| Fontes | Inter e Space Grotesk, locais via `@fontsource` |
| Testes | `node:test`, o executor de testes do próprio Node |

## Como rodar

```bash
npm install
npm test             # testes automatizados
npm start            # abre o aplicativo
npm run smoke        # abre, confere que carregou sem erro e fecha sozinho
npm run screenshot   # gera um PNG com dados fictícios
```

Mais detalhes, como a configuração da linha de status para os limites automáticos, estão no [README](README.md).

## Estrutura do projeto

```
src/main/       processo principal: leitura de logs, parser, agregação, janela
src/renderer/   interface: HTML, CSS e JavaScript
fixtures/       logs e limites fictícios usados nos testes
test/           testes automatizados
scripts/        prova de leitura, smoke test, screenshot e linha de status
```

## Situação

- **Fase 1 (MVP):** concluída e conferida. O total de hoje bate com uma leitura independente, e a atualização ao vivo aparece em menos de 2 segundos.
- **Limites do plano:** já disponíveis, com leitura automática e manual.
- **Versão 2:** em planejamento, desenvolvida em uma branch própria.

