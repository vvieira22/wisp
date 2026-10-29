"use strict";

const DICTIONARIES = {
  en: {
    // Header & Navigation
    appTitle: "Wisp",
    backToChat: "Back to chat",
    account: "Account",
    settings: "Settings",
    hidePanel: "Hide panel",

    // Engine Tabs
    engineCursor: "Cursor",
    engineAntigravity: "Antigravity",
    engineOpenCode: "OpenCode",

    compatTitle: "Tested stack",
    compatLead: "Wisp {version} was tested with the exact versions below. Other versions may cause errors.",
    compatWarnBanner:
      "You are not on the tested version for this engine. Failures and errors are more likely.",
    compatColComponent: "Component",
    compatColTested: "Tested",
    compatColYours: "Yours",
    compatRefresh: "Check versions",
    compatStatusOk: "match",
    compatStatusMismatch: "different — may break",
    compatStatusMissing: "not installed",
    compatStatusPending: "checking…",
    compatStatusBundledUnknown: "bundled (version unreadable)",
    compatComponentWisp: "Wisp",
    compatComponentCursorSdk: "@cursor/sdk",
    compatComponentElectron: "Electron",
    compatComponentAgy: "Antigravity CLI (agy)",
    compatComponentOpenCode: "OpenCode CLI",
    compatChatBanner: "Untested stack for this engine — errors are more likely. Open Settings → Tested stack.",
    compatUpdateBtn: "Update",
    compatUpdateTo: "Update → {version}",
    compatUpdateConfirmText:
      "Updating {name}{target} may cause compatibility issues (tested version: {tested}). Update anyway?",
    compatUpdateConfirmBtn: "Update anyway",
    compatUpdating: "Updating {name}…",
    compatUpdateOk: "{name} updated successfully.",
    compatUpdateFailed: "Failed to update {name}: {error}",

    // Project & Chats
    project: "Project",
    chooseFolder: "choose folder",
    noFolder: "no folder",
    chooseProjectFolder: "Choose project folder",
    chat: "Chat",
    newChat: "New chat",
    chatName: "Chat name",
    clearCurrentChat: "Clear current chat",
    clearThisChatPrompt: "Clear this chat?",
    deleteChat: "Delete chat",
    deleteChatPrompt: "Delete this chat?",
    clear: "Clear",
    no: "No",
    yes: "Yes",
    busyMark: " (busy)",
    chooseOtherFolder: "Choose another folder…",
    notifyDoneTitle: "{engine} · {project}",
    notifyDoneBody: "{chat} finished",
    notifyErrorBody: "{chat} failed",
    notifyPermissionBody: "{chat} awaits permission",
    toastOpenBtn: "Open",

    // Empty Log
    emptyTitle: "No messages yet",
    emptyCopy: "Type below. Mode and model are in the bar.",

    // Queue
    queued: "Queued",
    queueResponseInProgress: "Response in progress.",
    queueAskFormat: "Response in progress. Queue \"{text}\" or cancel and send now?",
    queueBtn: "Queue",
    cancelAndSend: "Cancel and send",
    back: "Back",
    removeFromQueue: "Remove from queue",

    // Permission
    agentRequestsPermission: "The agent requests permission.",
    allowPrefix: "Allow",
    allowOnce: "Allow once",
    always: "Always",
    deny: "Deny",

    // Composer
    inputPlaceholder: "Type here, / for a skill, @ for a file",
    mode: "Mode",
    modeAsk: "Ask",
    modePlan: "Plan",
    modeAgent: "Agent",
    model: "Model",
    effort: "Effort",
    sessionContext: "session context",
    connectAccount: "connect account",
    enterKey: "enter key",
    send: "Send",
    stop: "Stop",
    sendMessage: "Send message",
    stopResponse: "Stop response",
    queueMessage: "Queue message",
    thinking: "thinking…",

    // Settings Navigation
    tabGeneral: "General",
    tabLogs: "Logs",

    // Settings - Language
    language: "Language",
    languageSystem: "System Language",
    langEn: "English",
    langPtBr: "Português (Brasil)",

    // Settings - Mobile (LAN)
    lanTitle: "Mobile (LAN)",
    lanEnable: "Access from phone",
    lanEnableHint: "Serves Wisp on your Wi-Fi. Allow Wisp in the Windows Firewall (private network) when asked.",
    lanHideDesktop: "Invisible PC mode",
    lanHideDesktopHint: "Hides Wisp windows on the PC while you use the phone.",
    lanCopy: "Copy link",
    lanRegenerate: "New token",
    lanCopied: "Copied!",
    lanQrHint: "Scan with your phone camera.",
    lanClients: "{count} device(s) connected",
    lanNoClients: "No phone connected",
    lanDisconnect: "Disconnect",
    lanHttps: "HTTPS (install as app)",
    lanHttpsHint: "Required for Android to offer the app install. Install the certificate once.",
    lanHttpsUnavailable: "HTTPS unavailable: could not generate the local certificate on this computer.",
    lanCertTitle: "Install on your phone",
    lanCertHint: "Scan the QR below and follow the Android or iPhone steps.",
    lanCertCopy: "Copy tutorial link",
    lanAppTitle: "2. Open Wisp and install",
    lanAppHint: "Scan the QR below and choose “Install app” in the browser menu. The installed app uses this address; if the PC's IP changes, scan the QR again (or reserve a fixed IP).",
    lanInstallHttpHint: "This page is open over HTTP. To install as an app, turn on HTTPS on the PC, install the certificate once, then open the HTTPS link.",
    lanInstallHttpsReady: "Wisp is on HTTPS. Tap “Install app on phone” to open the tutorial.",
    lanInstallOpen: "Install app on phone",
    mobileStatusReady: "Ready",
    mobileStatusThinking: "Thinking…",
    mobileStatusDone: "Done",
    mobileStatusError: "Error",
    mobilePcShow: "PC screen",
    mobilePcHide: "Show on PC",
    attachFiles: "Attach files",
    folderPickerTitle: "Choose a folder",
    folderRecent: "Recent projects",
    folderQuickRoots: "Quick access",
    folderSearchPlaceholder: "Search folders",
    folderSelectCurrent: "Select this folder",
    folderSelectNamed: "Select this folder ({name})",
    folderLoading: "Loading…",
    folderEmpty: "No subfolders here.",
    folderError: "Could not read this folder.",

    // Settings - Cursor
    cursorLead: "The key stays on this computer. Wisp uses it to communicate with Cursor.",
    cursorKeyLabel: "Cursor API Key",
    cursorConnected: "Cursor account connected",

    // Settings - Antigravity
    antigravityLead: "Connect to the Antigravity / Gemini ecosystem.",
    connectionMode: "Connection Mode",
    cliLocal: "Local CLI (agy)",
    apiCloud: "Gemini API (Cloud)",
    usingLocalCli: "Using local binary",
    geminiKeyLabel: "Gemini API Key (Google AI Studio)",
    geminiKeyHint: "Generate for free in Google AI Studio (no CLI installation needed).",
    geminiConnected: "Gemini API connected",
    cliConnected: "Local CLI (agy) connected",

    // Settings - OpenCode
    opencodeLead: "BYOK via OpenCode. The key stays on this computer; the CLI communicates with the provider's API.",
    opencodeWarn: "Wisp does not embed OpenCode. The opencode CLI must be installed in PATH. No paid OpenCode account needed — only the provider key.",
    opencodeStep1: "Install the CLI: npm i -g opencode-ai",
    opencodeStep2: "Check in terminal: opencode --version",
    opencodeStep3: "Create the API key on the provider site (DeepSeek, Z.AI or Moonshot)",
    opencodeStep4: "Choose chip, paste the key and click Verify setup",
    provider: "Provider",
    apiKey: "API Key",
    notVerifiedYet: "Not verified yet.",
    verifyingCliAndKey: "Verifying CLI and key…",
    verifySetup: "Verify setup",
    opencodeAllOk: "All ok: CLI + key for",
    opencodeCliOkKeyMissing: "CLI ok ({path}). API key missing.",
    opencodeSetupIncomplete: "Setup incomplete — see notice above.",
    opencodeCliFoundNeedKey: "CLI found. Only valid provider key is missing.",

    // Settings - Probe & Mascot
    probeStatusDefault: "Upon saving, tests the connection and fetches available models.",
    saveAndTest: "Save and test",
    testingKey: "testing key…",
    testingAntigravity: "testing Antigravity connection…",
    verifyingOpenCode: "verifying OpenCode setup…",
    keyRejected: "key rejected",
    antigravityFailed: "Antigravity connection failed",
    keyOk: "Key ok",
    accountConnected: "Account connected: {who}",
    modelsAvailableHint: "{count} models available. Return to chat to pick mode.",

    mascot: "Mascot",
    mascotChangeTitle: "Change bundled mascot.riv for another .riv",
    change: "Change",
    resetToDefault: "Reset to default",
    pose: "Pose",
    poseTitle: "Test mascot pose without sending a message",
    mascotProjectSuffix: " (project)",

    // Settings - Logs
    systemStable: "System stable",
    warningDetected: "warning",
    warningsDetected: "warnings",
    errorDetected: "error detected",
    errorsDetected: "errors detected",
    totalLogs: "Total:",
    errorsLogs: "Errors:",
    warnsLogs: "Warnings:",
    lastErrorDetected: "Last detected error",
    logFilterAll: "All",
    logFilterErrors: "Errors",
    logFilterWarns: "Warnings",
    logFilterInfo: "Info",
    filterLogsPlaceholder: "Filter logs...",
    filterBySource: "Filter by source",
    allSources: "All sources",
    sourceSystem: "System",
    copyLogs: "Copy logs",
    logsCopied: "Logs copied!",
    clearLogs: "Clear",
    clearLogsHistory: "Clear logs history",
    noLogsRecorded: "No logs recorded yet.",
    noLogsMatchFilter: "No logs found for current filter.",
    copyThisLog: "Copy this log",
    viewDetailsDiagnostics: "View details / diagnostics",
    copied: "Copied!",
    detailsLabel: "Details",
    errorChatUI: "Chat interface error",

    // Engine Switch Modal
    switchProviderTitle: "Switch provider?",
    switchProviderSpecificTitle: "Switch to {target}?",
    switchProviderDesc: "Switching to the selected provider will alternate conversation history and available models from <strong>{current}</strong> to <strong>{target}</strong>.",
    switchProviderWarnRunning: "The response currently being generated will be canceled.",
    cancel: "Cancel",
    switch: "Switch",

    // Skills
    nothingWithName: "nothing with that name",
    noSkillsInFolders: "no skills in these folders",
    noFilesInFolder: "no files in this folder",
    skillSourceProject: "project",
    skillSourceUser: "user",

    // Attachments
    removeAttachment: "Remove attachment",
    removeAttachmentAria: "Remove {name}",
    directoryLabel: "Directory:",
    referencedFilesHeader: "Referenced files:",

    // System Messages
    clickProjectFolderHint: "Click on Project to choose your workspace folder.",
    sessionGapNotice: "Did not resume previous session. This response starts fresh.",
    interactiveApprovalUnsupported: "This provider does not support interactive approval. Deny or wait for turn to finish.",
    permissionFailedResponse: "Could not respond to permission.",
    runStopped: "stopped",
    runFailed: "failed",
    optionN: "option {n}",

    // Pet Bubble
    bubbleWriting: "Writing",
    bubbleWorking: "Working",
    bubbleDone: "Done",
    bubbleError: "Error",

    // Tray Menu
    trayOpenChat: "Open chat",
    trayHideChat: "Hide chat",
    trayNewChat: "New chat",
    trayPickMascot: "Mascot .riv…",
    trayDefaultMascot: "Default mascot",
    trayQuit: "Quit",

    // Native Dialogs
    dialogPickFolder: "Project folder",
    dialogPickMascot: "Rive Mascot",

    // Meter / Usage
    meterLastTurn: "Last turn",
    meterInput: "in",
    meterOutput: "out",
    meterThinking: "think",
    meterCharged: "charged",
    meterRaw: "raw",
    meterTime: "time",
    meterSession: "Session",
    meterPrompt: "prompt",
    meterPrompts: "prompts",
    meterSpent: "spent",
    meterContext: "context",
  },
  "pt-BR": {
    // Header & Navigation
    appTitle: "Wisp",
    backToChat: "Voltar ao chat",
    account: "Conta",
    settings: "Configurações",
    hidePanel: "Esconder o painel",

    // Engine Tabs
    engineCursor: "Cursor",
    engineAntigravity: "Antigravity",
    engineOpenCode: "OpenCode",

    compatTitle: "Stack testado",
    compatLead: "O Wisp {version} foi testado com as versões exatas abaixo. Outras versões podem causar erros.",
    compatWarnBanner:
      "Você não está na versão testada para este motor. Falhas e erros são mais prováveis.",
    compatColComponent: "Componente",
    compatColTested: "Testado",
    compatColYours: "Seu ambiente",
    compatRefresh: "Verificar versões",
    compatStatusOk: "ok",
    compatStatusMismatch: "diferente — pode quebrar",
    compatStatusMissing: "não instalado",
    compatStatusPending: "verificando…",
    compatStatusBundledUnknown: "embutido (versão não lida)",
    compatComponentWisp: "Wisp",
    compatComponentCursorSdk: "@cursor/sdk",
    compatComponentElectron: "Electron",
    compatComponentAgy: "CLI Antigravity (agy)",
    compatComponentOpenCode: "CLI OpenCode",
    compatChatBanner:
      "Stack fora do testado para este motor — erros são mais prováveis. Abra Configurações → Stack testado.",
    compatUpdateBtn: "Atualizar",
    compatUpdateTo: "Atualizar → {version}",
    compatUpdateConfirmText:
      "Atualizar {name}{target} pode causar problemas de compatibilidade (versão testada: {tested}). Deseja atualizar mesmo assim?",
    compatUpdateConfirmBtn: "Atualizar mesmo assim",
    compatUpdating: "Atualizando {name}…",
    compatUpdateOk: "{name} atualizado com sucesso.",
    compatUpdateFailed: "Falha ao atualizar {name}: {error}",

    // Project & Chats
    project: "Projeto",
    chooseFolder: "escolher pasta",
    noFolder: "sem pasta",
    chooseProjectFolder: "Escolhe a pasta do projeto",
    chat: "Conversa",
    newChat: "Nova conversa",
    chatName: "Nome da conversa",
    clearCurrentChat: "Limpar conversa atual",
    clearThisChatPrompt: "Limpar esta conversa?",
    deleteChat: "Excluir conversa",
    deleteChatPrompt: "Deseja realmente excluir?",
    clear: "Limpar",
    no: "Não",
    yes: "Sim",
    busyMark: " (ocupada)",
    chooseOtherFolder: "Escolher outra pasta…",
    notifyDoneTitle: "{engine} · {project}",
    notifyDoneBody: "{chat} concluído",
    notifyErrorBody: "{chat} falhou",
    notifyPermissionBody: "{chat} pede permissão",
    toastOpenBtn: "Abrir",

    // Empty Log
    emptyTitle: "Nenhuma mensagem ainda",
    emptyCopy: "Escreve embaixo. Modo e modelo ficam na barra.",

    // Queue
    queued: "Na fila",
    queueResponseInProgress: "Resposta em andamento.",
    queueAskFormat: "Resposta em andamento. Enfileirar \"{text}\" ou cancelar e enviar agora?",
    queueBtn: "Na fila",
    cancelAndSend: "Cancelar e enviar",
    back: "Voltar",
    removeFromQueue: "Remover da fila",

    // Permission
    agentRequestsPermission: "O agente pede permissão.",
    allowPrefix: "Permitir",
    allowOnce: "Uma vez",
    always: "Sempre",
    deny: "Negar",

    // Composer
    inputPlaceholder: "Escreve aqui, / pra uma skill, @ pra um arquivo",
    mode: "Modo",
    modeAsk: "Perguntar",
    modePlan: "Plano",
    modeAgent: "Agente",
    model: "Modelo",
    effort: "Esforço",
    sessionContext: "contexto da sessão",
    connectAccount: "liga a conta",
    enterKey: "insira a chave",
    send: "Enviar",
    stop: "Parar",
    sendMessage: "Enviar mensagem",
    stopResponse: "Parar a resposta",
    queueMessage: "Adicionar à fila",
    thinking: "pensando…",

    // Settings Navigation
    tabGeneral: "Geral",
    tabLogs: "Logs",

    // Settings - Language
    language: "Idioma",
    languageSystem: "Idioma do Sistema",
    langEn: "English",
    langPtBr: "Português (Brasil)",

    // Settings - Mobile (LAN)
    lanTitle: "Celular (LAN)",
    lanEnable: "Acessar pelo celular",
    lanEnableHint: "Publica o Wisp no seu Wi-Fi. Permita o Wisp no Firewall do Windows (rede privada) quando ele perguntar.",
    lanHideDesktop: "Modo invisível no PC",
    lanHideDesktopHint: "Esconde as janelas do Wisp no PC enquanto você usa o celular.",
    lanCopy: "Copiar link",
    lanRegenerate: "Novo token",
    lanCopied: "Copiado!",
    lanQrHint: "Escaneie com a câmera do celular.",
    lanClients: "{count} dispositivo(s) conectado(s)",
    lanNoClients: "Nenhum celular conectado",
    lanDisconnect: "Desconectar",
    lanHttps: "HTTPS (instalar como app)",
    lanHttpsHint: "Necessário para o Android oferecer a instalação do app. Instale o certificado uma vez.",
    lanHttpsUnavailable: "HTTPS indisponível: não foi possível gerar o certificado local neste computador.",
    lanCertTitle: "Instalação no celular",
    lanCertHint: "Escaneie o QR abaixo e siga o passo a passo para Android e iPhone.",
    lanCertCopy: "Copiar link do tutorial",
    lanAppTitle: "2. Abra o Wisp e instale",
    lanAppHint: "Escaneie o QR abaixo e escolha “Instalar app” no menu do navegador. O app instalado usa este endereço; se o IP do PC mudar, escaneie o QR de novo (ou reserve um IP fixo).",
    lanInstallHttpHint: "Esta página está em HTTP. Para instalar como app, ligue o HTTPS no PC, instale o certificado uma vez e abra o link HTTPS.",
    lanInstallHttpsReady: "O Wisp está em HTTPS. Toque em “Instalar app no celular” para abrir o tutorial.",
    lanInstallOpen: "Instalar app no celular",
    mobileStatusReady: "Pronto",
    mobileStatusThinking: "Pensando…",
    mobileStatusDone: "Concluído",
    mobileStatusError: "Erro",
    mobilePcShow: "Tela do PC",
    mobilePcHide: "Mostrar no PC",
    attachFiles: "Anexar arquivos",
    folderPickerTitle: "Escolher pasta",
    folderRecent: "Projetos recentes",
    folderQuickRoots: "Acesso rápido",
    folderSearchPlaceholder: "Buscar pastas",
    folderSelectCurrent: "Selecionar esta pasta",
    folderSelectNamed: "Selecionar esta pasta ({name})",
    folderLoading: "Carregando…",
    folderEmpty: "Nenhuma subpasta aqui.",
    folderError: "Não deu pra ler esta pasta.",

    // Settings - Cursor
    cursorLead: "A chave fica neste computador. O Wisp usa ela pra falar com o Cursor.",
    cursorKeyLabel: "Chave da API do Cursor",
    cursorConnected: "Conta Cursor conectada",

    // Settings - Antigravity
    antigravityLead: "Conecte ao ecossistema Antigravity / Gemini.",
    connectionMode: "Modo de Conexão",
    cliLocal: "CLI Local (agy)",
    apiCloud: "API Gemini (Nuvem)",
    usingLocalCli: "Usando o binário local",
    geminiKeyLabel: "Chave da API Gemini (Google AI Studio)",
    geminiKeyHint: "Gere gratuitamente no Google AI Studio (sem precisar instalar o CLI).",
    geminiConnected: "API Gemini conectada",
    cliConnected: "CLI Local (agy) conectado",

    // Settings - OpenCode
    opencodeLead: "BYOK via OpenCode. A chave fica neste computador; o CLI fala com a API do provedor.",
    opencodeWarn: "O Wisp não embute o OpenCode. É preciso ter o CLI opencode instalado no PATH. Não precisa de conta paga do OpenCode — só a key do provedor.",
    opencodeStep1: "Instale o CLI: npm i -g opencode-ai",
    opencodeStep2: "Confira no terminal: opencode --version",
    opencodeStep3: "Crie a API key no site do provedor (DeepSeek, Z.AI ou Moonshot)",
    opencodeStep4: "Escolha o chip, cole a key e clique em Verificar setup",
    provider: "Provedor",
    apiKey: "Chave da API",
    notVerifiedYet: "Ainda não verificado.",
    verifyingCliAndKey: "Verificando CLI e key…",
    verifySetup: "Verificar setup",
    opencodeAllOk: "Tudo ok: CLI + key do",
    opencodeCliOkKeyMissing: "CLI ok ({path}). Falta a chave da API.",
    opencodeSetupIncomplete: "Setup incompleto — veja o aviso acima.",
    opencodeCliFoundNeedKey: "CLI encontrado. Falta só a chave válida do provedor.",

    // Settings - Probe & Mascot
    probeStatusDefault: "Ao salvar, testa a conexão e busca os modelos disponíveis.",
    saveAndTest: "Salvar e testar",
    testingKey: "testando a chave…",
    testingAntigravity: "testando conexão Antigravity…",
    verifyingOpenCode: "verificando setup OpenCode…",
    keyRejected: "chave recusada",
    antigravityFailed: "falha na conexão Antigravity",
    keyOk: "Chave ok",
    accountConnected: "Conta ligada: {who}",
    modelsAvailableHint: "{count} modelos disponíveis. Volta ao chat pra escolher o modo.",

    mascot: "Mascote",
    mascotChangeTitle: "Troca o mascot.riv bundled por outro .riv",
    change: "Trocar",
    resetToDefault: "Voltar ao padrão",
    pose: "Pose",
    poseTitle: "Testa a pose do mascote sem mandar mensagem",
    mascotProjectSuffix: " (projeto)",

    // Settings - Logs
    systemStable: "Sistema estável",
    warningDetected: "aviso",
    warningsDetected: "avisos",
    errorDetected: "erro detectado",
    errorsDetected: "erros detectados",
    totalLogs: "Total:",
    errorsLogs: "Erros:",
    warnsLogs: "Avisos:",
    lastErrorDetected: "Último erro detectado",
    logFilterAll: "Todos",
    logFilterErrors: "Erros",
    logFilterWarns: "Avisos",
    logFilterInfo: "Info",
    filterLogsPlaceholder: "Filtrar logs...",
    filterBySource: "Filtrar por fonte",
    allSources: "Todas as fontes",
    sourceSystem: "Sistema",
    copyLogs: "Copiar logs",
    logsCopied: "Logs copiados!",
    clearLogs: "Limpar",
    clearLogsHistory: "Limpar histórico de logs",
    noLogsRecorded: "Nenhum log registrado ainda.",
    noLogsMatchFilter: "Nenhum log encontrado para o filtro atual.",
    copyThisLog: "Copiar este log",
    viewDetailsDiagnostics: "Ver detalhes / diagnóstico",
    copied: "Copiado!",
    detailsLabel: "Detalhes",
    errorChatUI: "Erro na interface do chat",

    // Engine Switch Modal
    switchProviderTitle: "Trocar provedor?",
    switchProviderSpecificTitle: "Trocar para {target}?",
    switchProviderDesc: "Alternará o histórico de conversas e os modelos de <strong>{current}</strong> para <strong>{target}</strong>.",
    switchProviderWarnRunning: "A resposta sendo gerada agora será cancelada.",
    cancel: "Cancelar",
    switch: "Trocar",

    // Skills
    nothingWithName: "nada com esse nome",
    noSkillsInFolders: "nenhuma skill nestas pastas",
    noFilesInFolder: "nenhum arquivo nesta pasta",
    skillSourceProject: "projeto",
    skillSourceUser: "user",

    // Attachments
    removeAttachment: "Remover anexo",
    removeAttachmentAria: "Remover {name}",
    directoryLabel: "Diretório:",
    referencedFilesHeader: "Arquivos referenciados:",

    // System Messages
    clickProjectFolderHint: "Clica em Projeto pra escolher a pasta do trabalho.",
    sessionGapNotice: "Não retomei a sessão anterior. Esta resposta começa do zero.",
    interactiveApprovalUnsupported: "Este provedor não aceita aprovação interativa. Nega ou espera o turno acabar.",
    permissionFailedResponse: "Não deu pra responder a permissão.",
    runStopped: "parou",
    runFailed: "falhou",
    optionN: "opção {n}",

    // Pet Bubble
    bubbleWriting: "Escrevendo",
    bubbleWorking: "Trabalhando",
    bubbleDone: "Pronto",
    bubbleError: "Erro",

    // Tray Menu
    trayOpenChat: "Abrir chat",
    trayHideChat: "Esconder chat",
    trayNewChat: "Nova conversa",
    trayPickMascot: "Mascote .riv…",
    trayDefaultMascot: "Mascote padrão",
    trayQuit: "Sair",

    // Native Dialogs
    dialogPickFolder: "Pasta do projeto",
    dialogPickMascot: "Mascote Rive",

    // Meter / Usage
    meterLastTurn: "Último turno",
    meterInput: "entrada",
    meterOutput: "saída",
    meterThinking: "raciocínio",
    meterCharged: "cobrado",
    meterRaw: "bruto",
    meterTime: "tempo",
    meterSession: "Sessão",
    meterPrompt: "prompt",
    meterPrompts: "prompts",
    meterSpent: "gasto",
    meterContext: "contexto",
  },
};

const DEFAULT_LANG = "en";
const SUPPORTED_LANGS = ["en", "pt-BR"];

let activeLang = DEFAULT_LANG;

function normalizeLang(lang) {
  const raw = String(lang || "").trim();
  if (raw === "pt" || raw === "pt-BR" || raw === "pt_BR") return "pt-BR";
  return "en";
}

function setLanguage(lang) {
  activeLang = normalizeLang(lang);
  return activeLang;
}

function getLanguage() {
  return activeLang;
}

function t(key, params, lang) {
  const code = normalizeLang(lang || activeLang);
  const dict = DICTIONARIES[code] || DICTIONARIES[DEFAULT_LANG];
  let text = dict[key];
  if (text === undefined) {
    text = DICTIONARIES[DEFAULT_LANG][key];
  }
  if (text === undefined) return String(key);
  if (!params || typeof params !== "object") return text;
  return text.replace(/\{(\w+)\}/g, (match, paramName) => {
    return params[paramName] !== undefined ? String(params[paramName]) : match;
  });
}

function applyTranslations(lang, root) {
  const targetCode = normalizeLang(lang || activeLang);
  const container = root || (typeof document !== "undefined" ? document : null);
  if (!container) return;

  const elements = container.querySelectorAll("[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label]");
  elements.forEach((el) => {
    const textKey = el.getAttribute("data-i18n");
    if (textKey) {
      el.textContent = t(textKey, null, targetCode);
    }
    const titleKey = el.getAttribute("data-i18n-title");
    if (titleKey) {
      el.title = t(titleKey, null, targetCode);
    }
    const placeholderKey = el.getAttribute("data-i18n-placeholder");
    if (placeholderKey) {
      el.placeholder = t(placeholderKey, null, targetCode);
    }
    const ariaKey = el.getAttribute("data-i18n-aria-label");
    if (ariaKey) {
      el.setAttribute("aria-label", t(ariaKey, null, targetCode));
    }
  });
}

const api = {
  DICTIONARIES,
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  normalizeLang,
  setLanguage,
  getLanguage,
  t,
  applyTranslations,
};

if (typeof module === "object" && module.exports) module.exports = api;
if (typeof document === "object") Object.assign(globalThis, api);
