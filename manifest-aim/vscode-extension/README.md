# Manifest AIM - VS Code Extension

IntelliSense, validation, and tooling for [AIM (Agent Instruction Manifest)](https://manifestaim.dev) files.

## Features

### IntelliSense & Autocomplete

- Smart completions for all AIM manifest fields
- Context-aware suggestions (e.g., action values, severity levels)
- Quick documentation on hover

### Validation

- Real-time schema validation
- Validate on save (configurable)
- Integration with `manifest validate` CLI

### Commands

Access via Command Palette (`Cmd/Ctrl + Shift + P`):

- **Manifest AIM: Validate** - Validate the current manifest
- **Manifest AIM: Run Enforcement** - Run `manifest enforce` on workspace
- **Manifest AIM: Generate Platform Context** - Run `manifest wrap` for a platform
- **Manifest AIM: Initialize** - Create a new `aim.yaml`

### Syntax Highlighting

Custom syntax highlighting for AIM-specific keywords:

- Governance keywords (rules, transforms, quality_gates)
- Actions (block, warn, transform, log)
- Severity levels (critical, error, warning, info)
- Enforcement types (static, semantic, injected)

## Requirements

- [Manifest AIM CLI](https://www.npmjs.com/package/manifest-aim) installed globally or in your project
- VS Code 1.85.0 or higher

## Installation

### From VS Code Marketplace

Search for "Manifest AIM" in the Extensions view.

### From VSIX

```bash
code --install-extension manifest-aim-0.1.0.vsix
```

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `manifest-aim.validateOnSave` | `true` | Validate manifests on save |
| `manifest-aim.showInlineHints` | `true` | Show inline hints for rules |
| `manifest-aim.defaultPlatform` | `claude-code` | Default platform for wrap command |

## Supported File Patterns

- `aim.yaml` / `aim.yml`
- `*.aim.yaml` / `*.aim.yml`

## Development

```bash
cd vscode-extension
npm install
npm run compile
```

Press F5 in VS Code to launch the extension in debug mode.

## Publishing

```bash
npm run package    # Create .vsix file
npm run publish    # Publish to marketplace
```

## License

MIT
