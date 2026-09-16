# Wisp

[Português](#português) | [English](#english)

---

## Português

O Wisp é um assistente de desktop com visual de pet que fica no canto da tela e se comunica diretamente com o SDK do Cursor Agent.

A ideia do projeto foi tirar o assistente de dentro de uma aba do navegador ou de um terminal escondido e transformá-lo em um elemento interativo no sistema operacional: um fantasma transparente, arrastável e leve, cuja animação reflete em tempo real o que o modelo está fazendo.

Ao clicar no mascote, um painel de chat se acopla à posição dele na tela para trocar ideias, planejar arquitetura ou pedir alterações diretas no código do seu projeto.

### Como funciona

1. **Vínculo com o projeto**: você seleciona a pasta de trabalho onde o Wisp deve atuar. Toda leitura, edição de arquivo e execução de comando fica restrita àquele diretório.
2. **Integração com Cursor**: utiliza a biblioteca oficial `@cursor/sdk`. As conversas mantêm contexto entre mensagens e exibem o consumo real de tokens em relação ao limite do modelo escolhido.
3. **Mascote reativo**: o estado visual do mascote muda de acordo com os eventos do agente:
   - Pensando (iniciando o raciocínio)
   - Lendo / Ferramenta (examinando arquivos ou rodando comandos)
   - Falando (escrevendo a resposta)
   - Notificando (terminou a tarefa)
   - Dormindo (quando fica inativo na tela)
   - Erro (caso algo falhe na chamada)
4. **Mascote customizável**: vem por padrão com um fantasma animado em SVG puro, mas possui suporte nativo a arquivos Rive (`.riv`) com máquina de estados.

### Modos de operação

- **Perguntar**: somente tira dúvidas e analisa arquivos. Não altera código nem roda comandos.
- **Plano**: estrutura passos e estratégias antes de qualquer execução prática.
- **Agente**: modo completo de desenvolvimento, com permissão para criar, editar arquivos e rodar comandos no workspace.

### Recursos

- **Suporte a Skills**: detecta automaticamente arquivos `SKILL.md` existentes no projeto ou no sistema (pastas `.cursor`, `.agents`, `.claude`, etc.) e permite ativá-las usando `/` no chat.
- **Múltiplas conversas**: histórico local com opção de criar, renomear e alternar entre sessões.
- **Interface acoplada**: a janela do chat se posiciona e se ajusta automaticamente ao lado do mascote em qualquer monitor.
- **Monitor de contexto**: indicador visível da quantidade de tokens consumidos no turno.

### Como rodar

Você vai precisar de Node.js instalado e de uma chave de API do Cursor.

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/wisp.git
cd wisp

# Instale as dependências
npm install

# Inicie o aplicativo
npm start
```

Na primeira inicialização, abra a engrenagem no chat, insira sua chave do Cursor e selecione a pasta do projeto que deseja trabalhar.

### Tecnologias

- Electron
- Node.js
- @cursor/sdk
- @rive-app/canvas (Rive Runtime)
- HTML5 / Canvas / SVG / CSS

---

## English

Wisp is a lightweight desktop companion that sits on your screen and connects directly to the local Cursor Agent SDK.

The project takes AI coding assistance out of hidden terminal windows or browser tabs and turns it into an ambient desktop presence: a draggable, transparent ghost whose animations react in real time to whatever the agent is doing.

Clicking the ghost opens a docked chat window anchored to its position, ready to answer questions, plan refactors, or write and edit code in your project.

### How it works

1. **Workspace scoping**: you point Wisp to a project folder. All file reading, modifications, and command executions stay strictly confined to that directory.
2. **Cursor SDK integration**: powered by `@cursor/sdk`. Chats maintain session context and display actual token usage against the active model's context window.
3. **Reactive mascot**: the ghost's visual state reacts to agent lifecycle events:
   - Thinking (initiating prompt and reasoning)
   - Reading / Tool (inspecting files or running commands)
   - Talking (streaming the assistant response)
   - Notify (turn completed)
   - Sleepy (idle on screen after some time)
   - Error (if an API call or tool execution fails)
4. **Custom mascot support**: ships with a default animated SVG pet, with out-of-the-box support for loading custom Rive (`.riv`) state-machine runtimes.

### Operation modes

- **Ask**: read-only Q&A. Explains code and reviews files without touching your filesystem.
- **Plan**: drafts architectural plans and breakdown steps without executing them.
- **Agent**: full development mode with permissions to edit files and run terminal commands in the workspace.

### Key features

- **Skills detection**: automatically indexes `SKILL.md` files from `.cursor`, `.agents`, `.claude`, and similar folders, accessible via `/` in the composer.
- **Session management**: switch between multiple conversations, rename chats, and retain history per workspace.
- **Smart window docking**: the chat panel snaps and docks alongside the mascot dynamically across monitors.
- **Context meter**: real-time counter tracking token usage versus the model limit.

### Getting started

Requires Node.js and a Cursor API key.

```bash
# Clone the repository
git clone https://github.com/your-username/wisp.git
cd wisp

# Install dependencies
npm install

# Launch the app
npm start
```

On first run, click the settings button in the chat, paste your Cursor API key, and select your workspace directory.

### Tech stack

- Electron
- Node.js
- @cursor/sdk
- @rive-app/canvas (Rive Runtime)
- HTML5 / Canvas / SVG / CSS
