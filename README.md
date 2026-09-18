# Wisp

[Português](#português) | [English](#english)

---

## Português

O **Wisp** é um companheiro de código que fica na sua área de trabalho como um mascote ("desktop pet"). Em vez de ficar alternando entre abas do navegador ou manter janelas de terminal escondidas, você tem um fantasminha flutuante no canto da tela que reage visualmente ao que o agente de IA está fazendo e abre um painel de chat ao ser clicado.

### A proposta

A ideia do Wisp é simples: trazer presença visual e agilidade ao uso de agentes de IA no dia a dia de desenvolvimento.

- **Sempre à mão sem atrapalhar:** ele fica no canto da tela, transparente e arrastável. Clicou nele, o chat abre colado ao mascote; clicou fora ou fechou, ele recolhe.
- **Feedback visual imediato:** você bate o olho no pet e já sabe o que a IA está fazendo sem precisar ler logs:
  - *Pensando:* iniciando o raciocínio.
  - *Lendo / Ferramentas:* examinando arquivos do projeto ou rodando comandos no terminal.
  - *Falando:* escrevendo a resposta no chat.
  - *Notificando:* terminou a tarefa solicitada.
  - *Dormindo:* ocioso no canto da tela.
  - *Erro:* caso algo falhe na chamada.
- **Você no controle do projeto:** você seleciona a pasta de trabalho (workspace) onde o Wisp deve atuar. Toda leitura, edição de arquivo e execução de comando fica estritamente restrita àquele diretório.
- **Liberdade de provedores:** o Wisp não te prende a um único modelo ou ecossistema. Você pode alternar facilmente entre três motores no topo do chat:
  - **Cursor** (via `@cursor/sdk`)
  - **Antigravity** (via CLI do `agy`)
  - **OpenCode** (via CLI do `opencode` com múltiplos provedores)

### Onde as conversas são salvas?

Tudo é armazenado **100% localmente no seu computador**. O Wisp não envia seu histórico para servidores em nuvem ou bancos de dados externos — o tráfego acontece apenas diretamente entre a sua máquina e a API do provedor configurado.

Os dados ficam guardados na pasta padrão do sistema operacional:

- **Windows:** `%APPDATA%\wisp\` (geralmente `C:\Users\<seu-usuario>\AppData\Roaming\wisp\`)
- **macOS:** `~/Library/Application Support/wisp/`
- **Linux:** `~/.config/wisp/`

Dentro dessa pasta ficam os seguintes arquivos:
- `config.json`: guarda suas configurações gerais (chaves de API, workspace ativo, opções visuais).
- `chats.json`: histórico das conversas do motor Cursor.
- `chats-antigravity.json`: histórico das conversas do motor Antigravity.
- `chats-opencode.json`: histórico das conversas do motor OpenCode.

Se você quiser fazer backup do seu histórico ou limpá-lo, basta abrir essa pasta e gerenciar esses arquivos `.json`.

### Modos de operação

- **Perguntar:** somente tira dúvidas e analisa arquivos para explicar o código. Não altera arquivos nem roda comandos.
- **Plano:** estrutura passos e estratégias antes de qualquer execução prática.
- **Agente:** modo de desenvolvimento completo, com permissão para criar, editar arquivos e rodar comandos no workspace.

### Recursos

- **Skills automáticas:** detecta automaticamente arquivos `SKILL.md` existentes no projeto ou no sistema (pastas `.cursor`, `.agents`, `.claude`, etc.) e permite ativá-las usando `/` no chat.
- **Múltiplas conversas:** crie novas conversas, renomeie ou alterne entre sessões a qualquer momento.
- **Mascote personalizável:** vem por padrão com um fantasma animado em SVG/Canvas, mas possui suporte nativo a arquivos Rive (`.riv`) com máquina de estados.
- **Janela acoplada:** o painel de chat se posiciona e se ajusta automaticamente ao lado do mascote em qualquer monitor.
- **Monitor de contexto:** contador visível da quantidade de tokens consumidos no turno em relação ao limite do modelo.

### Como rodar

Você vai precisar do [Node.js](https://nodejs.org/) instalado.

```bash
# Clone o repositório
git clone https://github.com/vvieira22/wisp.git
cd wisp

# Instale as dependências
npm install

# Inicie o aplicativo
npm start
```

Na primeira inicialização, clique na engrenagem no chat (configurações), escolha seu motor de IA, informe as chaves ou caminhos necessários e selecione a pasta do projeto em que deseja trabalhar.

### Scripts úteis

- `npm run check`: executa as validações e testes rápidos das bibliotecas internas.
- `npm run pack`: compila a aplicação localmente sem empacotar instalador.
- `npm run dist`: gera os instaladores para o sistema operacional atual.

### Tecnologias

- Electron
- Node.js
- @cursor/sdk
- Google Antigravity CLI (`agy`)
- OpenCode CLI (`opencode`)
- @rive-app/canvas (Rive Runtime)
- HTML5 / CSS / Canvas / SVG

---

## English

**Wisp** is a desktop AI companion that lives on your screen as a floating pet. Instead of switching back and forth between browser tabs or keeping terminal windows hidden, you get a lightweight ghost sitting in the corner of your screen that visually reacts to whatever the AI agent is doing and opens a docked chat window when clicked.

### The Idea

The goal behind Wisp is straightforward: bring visual presence and quick access to AI coding agents in your daily workflow.

- **Always within reach, never in the way:** floats transparently on your screen and can be dragged anywhere. Click it to open the docked chat panel; click outside or press Escape to tuck it away.
- **Immediate visual feedback:** glance at the pet and instantly know what the agent is doing without reading logs:
  - *Thinking:* formulating ideas and reasoning.
  - *Reading / Tools:* inspecting project files or running terminal commands.
  - *Talking:* streaming responses into the chat.
  - *Notifying:* requested task completed.
  - *Sleeping:* resting idle on your desktop.
  - *Error:* if an error occurs during execution.
- **Scoped to your project:** you select your active workspace directory. All file reads, edits, and terminal commands are strictly confined to that folder.
- **Engine freedom:** Wisp doesn't lock you into a single tool or model. Switch between three backends anytime using the tabs at the top of the chat:
  - **Cursor** (via `@cursor/sdk`)
  - **Antigravity** (via `agy` CLI)
  - **OpenCode** (via `opencode` CLI with multi-provider support)

### Where are conversations saved?

Everything is stored **100% locally on your computer**. Wisp never uploads your chat history to any custom backend or cloud server — data only travels directly between your machine and the configured AI provider.

Files are stored in your operating system's standard user data directory:

- **Windows:** `%APPDATA%\wisp\` (e.g. `C:\Users\<username>\AppData\Roaming\wisp\`)
- **macOS:** `~/Library/Application Support/wisp/`
- **Linux:** `~/.config/wisp/`

Inside this folder, you will find:
- `config.json`: stores your general settings (API keys, active workspace, visual options).
- `chats.json`: conversation history for the Cursor engine.
- `chats-antigravity.json`: conversation history for the Antigravity engine.
- `chats-opencode.json`: conversation history for the OpenCode engine.

To back up or reset your history, simply open that directory and manage the `.json` files.

### Operation modes

- **Ask:** read-only questions and code explanations. Does not touch or modify files.
- **Plan:** breaks down architecture and steps before running code changes.
- **Agent:** full autonomous mode, with permission to create, edit files, and execute commands in the workspace.

### Key features

- **Automatic skills indexing:** discovers `SKILL.md` files across your project and system directories (`.cursor`, `.agents`, `.claude`, etc.) and lets you invoke them with `/` in the chat.
- **Multiple conversations:** create, rename, and switch between chat sessions on the fly.
- **Customizable mascot:** ships with a default Canvas/SVG ghost, but natively supports custom Rive (`.riv`) state machines.
- **Smart window docking:** chat panel snaps seamlessly beside the pet, adapting across multiple screens and positions.
- **Context meter:** real-time token tracking relative to the active model's limits.

### Getting started

Requires [Node.js](https://nodejs.org/) installed.

```bash
# Clone the repository
git clone https://github.com/vvieira22/wisp.git
cd wisp

# Install dependencies
npm install

# Start the application
npm start
```

On first launch, click the settings gear in the chat, choose your engine, configure your credentials/paths, and select your project workspace.

### Useful scripts

- `npm run check`: runs self-checks for internal modules.
- `npm run pack`: packages the application directory without creating an installer.
- `npm run dist`: builds installers for your current platform.

### Tech stack

- Electron
- Node.js
- @cursor/sdk
- Google Antigravity CLI (`agy`)
- OpenCode CLI (`opencode`)
- @rive-app/canvas (Rive Runtime)
- HTML5 / CSS / Canvas / SVG
