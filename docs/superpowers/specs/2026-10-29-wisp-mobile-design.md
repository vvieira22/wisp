# Wisp Mobile (Controle Remoto via LAN / PWA) — Design Spec

**Data:** 2026-10-29  
**Escopo:** Servidor LAN embutido no Wisp Desktop + Web App / PWA Mobile de tela cheia + Seletor remoto de pastas do PC + Modo Invisível (Tray-only) no PC com sincronia bidirecional sem conflitos.

---

## 1. Objetivo e Visão Geral

Permitir controlar o Wisp que roda no computador (Windows/macOS/Linux) diretamente pelo celular (Android/iOS) dentro da rede local (Wi-Fi/LAN), sem precisar compilar ou instalar aplicativos nativos separados (APK/IPA).

O próprio processo principal do Wisp serve uma aplicação Web/PWA responsiva e moderna na rede local, acessível via **QR Code com token de segurança**. Enquanto o usuário utiliza pelo celular, o Wisp no PC pode operar em **Modo Invisível (Tray-only)** — sem janelas de chat ou mascote sobrepondo a tela do monitor — podendo voltar para a tela do PC a qualquer momento (pelo celular ou pelo ícone da bandeja) com sincronia imediata.

---

## 2. Arquitetura e Componentes

```
[ Celular (Navegador / PWA Tela Cheia) ]
  ├── index/chat.html (data-client="mobile") + src/mobile.css + manifest.json
  ├── src/chat.js + src/lib/* (mesmo motor lógico do Desktop)
  └── src/mobile-bridge.js (implementa window.wisp via HTTP RPC + SSE)
          │
          │ Wi-Fi / LAN (HTTP + SSE autenticado por Token/Cookie)
          ▼
[ PC: Electron Main Process (electron/main.js + electron/lan-server.js) ]
  ├── Fonte única da verdade: chatsByEngine, sessions*, rawCfg(), logger
  ├── Broadcast simultâneo para Desktop (ipcRenderer) e Mobile (SSE clients)
  ├── Explorador de pastas remoto (src/lib/folders.js)
  ├── Gerenciador de uploads temporários com GC automático
  └── Controle de visibilidade no PC (desktopHidden / Tray-only mode)
```

### 2.1. Servidor LAN Nativo (`electron/lan-server.js` + `src/lib/lan.js`)
- **Zero dependências externas:** Construído exclusivamente com `node:http`, `node:crypto`, `node:os`, `node:fs` e `node:path`.
- **Configuração persistida (`config.json` -> `lan`):**
  - `enabled` (boolean, padrão `false` até o usuário ativar, ou ativável com 1 clique nas Configurações / Bandeja).
  - `port` (number, padrão `4777`, com fallback automático caso ocupada).
  - `token` (string hex de 256 bits gerada via `crypto.randomBytes(32)`, com opção de regenerar/revogar).
  - `hideDesktop` (boolean: se o Wisp no PC está em modo invisível na bandeja).
- **Autenticação:**
  - O QR Code aponta para `http://<LAN_IP>:<PORT>/?token=<TOKEN>`.
  - Quando o celular acessa com `?token=<TOKEN>`, o servidor valida com `crypto.timingSafeEqual`, define um cookie `wisp_token=<TOKEN>; HttpOnly; SameSite=Lax; Path=/` (além de permitir header `Authorization: Bearer <TOKEN>`) e redireciona para `/` limpando o token da barra de endereços.
  - Qualquer rota `/api/*` sem token válido retorna `401 Unauthorized`.
- **QR Code SVG embutido (`src/lib/qr.js`):**
  - Gerador enxuto de QR Code em SVG puro (sem dependências externas) exibido na aba de Configurações do Wisp no PC junto com o endereço da LAN, status de dispositivos conectados e botão de copiar link.

### 2.2. Ponte `window.wisp` para Mobile (`src/mobile-bridge.js`)
- Substitui o `electron/preload.js` quando a página roda no navegador do celular.
- Expõe **exatamente os mesmos métodos** de `window.wisp`:
  - **Comandos (`POST /api/rpc`):** `getEngine`, `setEngine`, `getConfig`, `setConfig`, `send`, `cancel`, `respondPermission`, `jumpChat`, `probe`, `compatReport`, `updateComponent`, `reset`, `clearChat`, `listChats`, `saveChat`, `openChat`, `deleteChat`, `renameChat`, `patchChat`, `listSkills`, `listFiles`, `getLogs`, `clearLogs`, `addLog`, mais os novos comandos mobile/remotos:
    - `listFolders(dirPath)`: navega nas pastas do PC remotamente.
    - `getLanStatus()` / `setLanConfig(partial)`: consulta/altera status do servidor LAN e modo invisível no PC.
    - `setDesktopVisible(visible)`: mostra ou esconde o Wisp (mascote + chat) na tela do PC.
  - **Eventos em Tempo Real (`GET /api/events` via `EventSource` / SSE):**
    - Recebe `chat:event`, `chats:update`, `engine:changed`, `account:update`, `pet:state`, `compat:report`, `logs:entry`, `config:lang`, `desktop:visibility` e despacha para os callbacks registrados (`onChat`, `onChats`, `onEngine`, etc.).

---

## 3. Execução Desacoplada e Sincronia Desktop ↔ Mobile

### 3.1. Tarefas nunca param se o celular desconectar
- O ciclo de vida de `chat:send` roda inteiramente no processo principal do Wisp no PC (`electron/main.js`).
- Quando o celular chama `send(text, chatId, engine)` via `POST /api/rpc`:
  - O servidor inicia a execução do agente no PC de forma **totalmente desacoplada do socket HTTP/SSE do celular**.
  - Se o Wi-Fi cair, o navegador mobile for fechado ou a tela do celular bloquear no meio de uma geração longa, **o agente continua trabalhando normalmente no PC** e gravando todos os eventos em `storeFor(engine)`.
  - A tarefa **só é interrompida** se o usuário acionar explicitamente o comando de parar (`chat:cancel`).
- Quando o celular reconectar (`EventSource` `onopen` ou evento `visibilitychange` ao desbloquear a tela), o `mobile-bridge.js` recarrega automaticamente `listChats()` e `getConfig()`, exibindo todo o progresso ou resposta concluída.

### 3.2. Sincronia sem conflitos e Modo Invisível no PC (`desktopHidden`)
- **Fonte única da verdade no Main Process:**
  - `stashChat(payload)` no `electron/main.js` será ajustado para **não sobrescrever** `chat.messages` do servidor com mensagens vindas do DOM de um cliente se o histórico do servidor já possuir mensagens mais recentes (`chat.at`) ou se vier de uma troca de foco/janela. Como `appendUser` e `applyRunEvent` já atualizam `storeFor(engine)` a cada evento no servidor, o processo principal tem sempre o estado completo e autoritativo.
- **Modo Invisível no PC (Tray-only):**
  - Quando `desktopHidden = true`:
    - `petWin.hide()` e `chatWin.hide()` são chamados no PC.
    - Notificações nativas do sistema operacional no PC (`notifyTaskEvent`) são suprimidas enquanto houver cliente mobile conectado e `desktopHidden` ativo, evitando popups na tela do PC.
  - **Como voltar para o PC:**
    1. Clicando no ícone do Wisp na bandeja do Windows (System Tray) ou em *"Mostrar Wisp no Desktop"* no menu da bandeja.
    2. Tocando no botão **"Mostrar no PC"** direto no cabeçalho do app mobile.
    - Ao restaurar no PC, `petWin` e `chatWin` reaparecem imediatamente já sincronizados com a conversa, modelo e streaming ativos.

---

## 4. Layout Mobile (PWA) e Seletor Remoto de Pastas do PC

### 4.1. Experiência Visual Mobile (`src/mobile.css` + `manifest.json`)
- **Ativação:** Quando servido via LAN (ou com `?client=mobile`), o `<html>` recebe `data-client="mobile"`, carrega `src/mobile.css` e `src/mobile-bridge.js`, além das meta tags `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">` e `manifest.json` para instalação como **PWA em tela cheia** no Android e iOS.
- **Layout Tela Cheia (`100dvh`):**
  - Remove bordas arredondadas externas e transparências de janela flutuante; ocupa 100% da viewport (`100dvh`) com suporte a `env(safe-area-inset-top)` e `env(safe-area-inset-bottom)`.
  - Adapta-se automaticamente à abertura do teclado virtual do celular (`visualViewport`).
- **Header Mobile:**
  - **Status ao vivo do Wisp:** Pílula visual mostrando o estado atual do agente (`Pronto`, `Pensando...`, `Usando ferramenta`, `Concluído`, `Erro`) + contador de tarefas em segundo plano.
  - **Toggle "Tela do PC":** Botão rápido no topo para ocultar/mostrar o Wisp no monitor do PC.
  - **Abas de Engine (`Cursor` | `Antigravity` | `OpenCode`)** com área de toque ampla.
- **Composer e Controles Touch:**
  - Alvos de toque com no mínimo `42px` de altura para seletores de **Modo**, **Modelo**, **Esforço/Fast** e botão de **Enviar/Parar**.
  - Botão de **Anexar (`+`)** visível na barra de digitação para enviar fotos/prints/arquivos do celular (já que no celular não há drag-and-drop de arquivos como no desktop).

### 4.2. Seletor Remoto de Projetos / Pastas do Windows (`src/lib/folders.js`)
Ao tocar no botão **Projeto (`#folder`)** no celular, abre um **Modal / Bottom-Sheet de Projetos** com 3 seções:
1. **Projetos Recentes & Ativos (1 toque):**
   - Lista `chats.projects` (projetos já usados no Wisp), destacando o nome da pasta, caminho abreviado e badge de tarefas ativas. Tocar em um projeto troca o `cwd` na hora.
2. **Atalhos Rápidos (Quick Roots) + Busca rápida:**
   - Chips de acesso rápido fornecidos pelo backend (`listFolders()`):
     - `📂 Pasta de Projetos` (diretório pai do `cwd` atual, ex.: `C:\Users\Vitor\Desktop\projects`)
     - `🖥️ Desktop`
     - `🏠 Home` (`os.homedir()`)
     - `💾 Discos` (`C:\`, `D:\`, etc. detectados no Windows, ou `/` no macOS/Linux)
   - Campo de busca instantânea para filtrar as pastas do diretório aberto.
3. **Navegador Visual de Pastas:**
   - **Breadcrumbs clicáveis** (`C: › Users › Vitor › Desktop › projects`) para subir a qualquer nível com 1 toque.
   - **Detecção de Repositório/Projeto:** O backend verifica se cada subpasta contém marcadores de projeto (`.git`, `package.json`, `pubspec.yaml`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `.sln`) e exibe um **badge de projeto (`git` / código)** ao lado do nome da pasta.
   - Botão fixo na parte inferior: **"Selecionar esta pasta (`<nome>`)"** que define o `cwd` ativo e carrega as conversas daquele projeto.

---

## 5. Uploads Temporários do Celular e Limpeza Automática (GC)

Como fotos e arquivos selecionados no celular não estão no disco do PC:
1. **Upload via `POST /api/upload`:**
   - O `mobile-bridge.js` envia o arquivo anexado (limite seguro de 25 MB por arquivo) para o servidor LAN, que grava em `path.join(os.tmpdir(), "wisp-mobile-uploads", "<timestamp>-<random>-<safeName>")` e retorna o caminho local do PC (`filePath`).
2. **Ciclo de Vida e Limpeza Automática (Zero Lixo Acumulado):**
   - **Na inicialização e no encerramento do Wisp (`app.whenReady` e `before-quit`):** A pasta `wisp-mobile-uploads` é limpa inteiramente.
   - **Após o término do turno (`run-end`, `run-error`, `run-cancel`) e ao limpar/deletar chat:** Quando não houver nenhum turno ativo (`busySet().size === 0`), um coletor (`pruneMobileUploads`) remove arquivos temporários já consumidos ou com mais de **30 minutos** de idade, garantindo que nenhum arquivo fique esquecido no disco.

---

## 6. Regras Invariantes (`AGENTS.md`) e Testes (`npm run check`)

1. **Invariantes preservadas:**
   - O modelo selecionado pelo usuário permanece selecionado até que ele escolha outro (`probe`, atualização de catálogo e `send` nunca trocam pelo primeiro da lista ou default da engine).
   - Enquanto um turno está rodando, o botão de `Stop` mostra o modelo que aquele turno está usando, e não o modelo selecionado para a próxima mensagem.
2. **Testes automatizados (`npm run check`):**
   - `src/lib/folders.check.js`: testa listagem de diretórios, breadcrumbs, atalhos rápidos, detecção de pastas de projeto (`.git`, `package.json`, etc.) e proteção contra caminhos inválidos.
   - `src/lib/lan.check.js`: testa autenticação por token/cookie, bloqueio de acesso não autorizado (`401`), execução RPC desacoplada (desconexão do cliente não cancela turno em andamento), SSE broadcast e limpeza automática (GC) da pasta de uploads temporários.
