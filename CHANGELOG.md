# Changelog

All notable changes to the Wisp project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-09-19

### Added
- **Desktop Companion Mascot**:
  - Transparent, draggable desktop pet floating cleanly above applications.
  - Expressive state animations (Idle, Thinking, Tools/Reading, Talking, Alert, Error) rendered with Rive runtime and SVG canvas.
  - Snap-to-pet docked chat window with multi-monitor positioning and quick toggle (`Escape` or click outside to dismiss).
- **Multi-Engine AI Coding Support**:
  - **Cursor Engine**: Native integration via `@cursor/sdk` with real-time file inspection, editing, and tool calling within the active workspace.
  - **Antigravity Engine**: Hybrid execution supporting both the local Google Antigravity CLI (`agy`) and direct Gemini API key via Google AI Studio, with adjustable reasoning effort.
  - **OpenCode Engine**: Multi-provider CLI subprocess supporting DeepSeek (V3/R1), GLM / Zhipu AI, and Kimi / Moonshot AI with interactive in-chat permission checks for file edits and terminal commands.
- **Security & Key Management**:
  - Encrypted credential storage at rest leveraging OS-native vaults (Windows DPAPI, macOS Keychain, Linux Secret Service).
  - Robust authenticated `AES-256-GCM` fallback when system keyring is not available.
  - In-memory-only key decryption during API invocations.
- **Local History & Workspaces**:
  - 100% local persistence in `%APPDATA%\wisp` (or OS equivalent) with per-engine chat histories.
  - Workspace confinement ensuring agent operations never exceed the designated project folder.
- **Skills System**:
  - Automatic indexing of `SKILL.md` prompt templates from project and system directories (`.cursor`, `.agents`, `.claude`), accessible via `/` in chat.
- **Diagnostics & Compatibility**:
  - Runtime compatibility tracking against known working provider and CLI versions (`compat.json`).
  - Self-check suite (`npm run check`) validating integrity across modules.
- **Automated CI/CD & Native Installers**:
  - GitHub Actions workflow triggering on merge to `main` branch.
  - Windows standalone installer (`.exe` via NSIS) and portable executable, macOS `.dmg`, and Linux `.AppImage`.
  - Automatic release notes generation with provider diff analysis and GitHub Releases publication.
