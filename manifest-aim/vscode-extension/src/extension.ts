/**
 * Manifest AIM VS Code Extension
 *
 * Provides IntelliSense, validation, and tooling for AIM manifest files.
 */

import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
  console.log("Manifest AIM extension activated");

  // Create diagnostic collection for validation errors
  diagnosticCollection = vscode.languages.createDiagnosticCollection("aim");
  context.subscriptions.push(diagnosticCollection);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("manifest-aim.validate", validateCommand),
    vscode.commands.registerCommand("manifest-aim.enforce", enforceCommand),
    vscode.commands.registerCommand("manifest-aim.wrap", wrapCommand),
    vscode.commands.registerCommand("manifest-aim.init", initCommand),
  );

  // Validate on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isAimManifest(document)) {
        const config = vscode.workspace.getConfiguration("manifest-aim");
        if (config.get("validateOnSave", true)) {
          validateDocument(document);
        }
      }
    }),
  );

  // Validate on open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isAimManifest(document)) {
        validateDocument(document);
      }
    }),
  );

  // Validate already open documents
  vscode.workspace.textDocuments.forEach((document) => {
    if (isAimManifest(document)) {
      validateDocument(document);
    }
  });

  // Register hover provider for quick documentation
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { pattern: "**/aim.yaml" },
      new AimHoverProvider(),
    ),
  );

  // Register completion provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { pattern: "**/aim.yaml" },
      new AimCompletionProvider(),
      ":",
      " ",
    ),
  );
}

export function deactivate() {
  if (diagnosticCollection) {
    diagnosticCollection.dispose();
  }
}

function isAimManifest(document: vscode.TextDocument): boolean {
  const fileName = path.basename(document.fileName);
  return (
    fileName === "aim.yaml" ||
    fileName === "aim.yml" ||
    fileName.endsWith(".aim.yaml") ||
    fileName.endsWith(".aim.yml")
  );
}

async function validateDocument(document: vscode.TextDocument): Promise<void> {
  const diagnostics: vscode.Diagnostic[] = [];

  try {
    const result = await runManifestCli(["validate", document.fileName]);

    if (result.exitCode !== 0) {
      // Parse validation errors from output
      const lines = result.stderr.split("\n");
      for (const line of lines) {
        const match = line.match(/line (\d+)/i);
        const lineNum = match ? parseInt(match[1], 10) - 1 : 0;

        if (line.includes("error") || line.includes("Error")) {
          diagnostics.push(
            new vscode.Diagnostic(
              new vscode.Range(lineNum, 0, lineNum, 1000),
              line.trim(),
              vscode.DiagnosticSeverity.Error,
            ),
          );
        } else if (line.includes("warning") || line.includes("Warning")) {
          diagnostics.push(
            new vscode.Diagnostic(
              new vscode.Range(lineNum, 0, lineNum, 1000),
              line.trim(),
              vscode.DiagnosticSeverity.Warning,
            ),
          );
        }
      }
    }
  } catch (err) {
    // CLI not available — show info message once
    console.log("Manifest AIM CLI not available for validation");
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

async function validateCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isAimManifest(editor.document)) {
    vscode.window.showWarningMessage("Open an AIM manifest file to validate");
    return;
  }

  const result = await runManifestCli(["validate", editor.document.fileName]);

  if (result.exitCode === 0) {
    vscode.window.showInformationMessage("AIM manifest is valid");
  } else {
    vscode.window.showErrorMessage(`Validation failed: ${result.stderr}`);
  }
}

async function enforceCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("Open a workspace to run enforcement");
    return;
  }

  const terminal = vscode.window.createTerminal("AIM Enforce");
  terminal.show();
  terminal.sendText("manifest enforce .");
}

async function wrapCommand(): Promise<void> {
  const config = vscode.workspace.getConfiguration("manifest-aim");
  const defaultPlatform = config.get<string>("defaultPlatform", "claude-code");

  const platform = await vscode.window.showQuickPick(
    ["claude-code", "cursor", "windsurf", "generic"],
    {
      placeHolder: "Select target platform",
      title: "Generate Platform Context",
    },
  );

  if (!platform) return;

  const terminal = vscode.window.createTerminal("AIM Wrap");
  terminal.show();
  terminal.sendText(`manifest wrap ${platform}`);
}

async function initCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("Open a workspace to initialize AIM");
    return;
  }

  const terminal = vscode.window.createTerminal("AIM Init");
  terminal.show();
  terminal.sendText("manifest init");
}

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runManifestCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve) => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    cp.exec(
      `npx manifest ${args.join(" ")}`,
      {
        cwd: workspaceFolder,
        timeout: 30000,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error?.code ?? 0,
        });
      },
    );
  });
}

/**
 * Hover provider for AIM manifest documentation.
 */
class AimHoverProvider implements vscode.HoverProvider {
  private docs: Record<string, string> = {
    aim: "AIM protocol version (e.g., '1.0')",
    metadata: "Package metadata: name, version, description, tags",
    context: "Agent context: persona, domain, environment",
    governance: "Rules, transforms, and quality gates",
    capabilities: "What the agent can do (tiered loading)",
    knowledge: "Domain knowledge units (loaded on trigger)",
    rules: "Enforcement rules with detection and actions",
    transforms: "Output transformations (remove, replace, inject)",
    quality_gates: "Code and content quality requirements",
    enforcement: "How the rule is enforced: static, semantic, or injected",
    action: "What happens when rule triggers: block, warn, transform, log",
    severity: "Rule severity: critical, error, warning, info",
    detect: "Detection configuration: pattern, tool, or semantic",
  };

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) return undefined;

    const word = document.getText(wordRange);
    const doc = this.docs[word];

    if (doc) {
      return new vscode.Hover(
        new vscode.MarkdownString(`**${word}**: ${doc}`),
      );
    }

    return undefined;
  }
}

/**
 * Completion provider for AIM manifest.
 */
class AimCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const line = document.lineAt(position).text;
    const items: vscode.CompletionItem[] = [];

    // Top-level keys
    if (position.character <= 2 || line.trim() === "") {
      items.push(
        this.createItem("aim", "AIM protocol version", '"1.0"'),
        this.createItem("metadata", "Package metadata"),
        this.createItem("context", "Agent context"),
        this.createItem("governance", "Rules and transforms"),
        this.createItem("capabilities", "Agent capabilities"),
        this.createItem("knowledge", "Domain knowledge"),
      );
    }

    // Governance sub-keys
    if (line.includes("governance") || this.isUnderKey(document, position, "governance")) {
      items.push(
        this.createItem("rules", "Enforcement rules"),
        this.createItem("transforms", "Output transforms"),
        this.createItem("quality_gates", "Quality requirements"),
      );
    }

    // Rule properties
    if (this.isUnderKey(document, position, "rules")) {
      items.push(
        this.createItem("name", "Rule identifier"),
        this.createItem("description", "Rule description"),
        this.createItem("enforcement", "static | semantic | injected"),
        this.createItem("detect", "Detection configuration"),
        this.createItem("action", "block | warn | transform | log"),
        this.createItem("severity", "critical | error | warning | info"),
        this.createItem("message", "Violation message"),
        this.createItem("fix_hint", "How to fix the violation"),
      );
    }

    // Action values
    if (line.includes("action:")) {
      items.push(
        this.createItem("block", "Prevent delivery"),
        this.createItem("warn", "Deliver with warning"),
        this.createItem("transform", "Auto-modify output"),
        this.createItem("log", "Silent audit logging"),
        this.createItem("retry", "Send back for fix"),
      );
    }

    // Severity values
    if (line.includes("severity:")) {
      items.push(
        this.createItem("critical", "Critical violation"),
        this.createItem("error", "Error"),
        this.createItem("warning", "Warning"),
        this.createItem("info", "Informational"),
      );
    }

    // Enforcement values
    if (line.includes("enforcement:")) {
      items.push(
        this.createItem("static", "Deterministic checks (patterns, tools)"),
        this.createItem("semantic", "LLM-as-judge evaluation"),
        this.createItem("injected", "Context injection only"),
      );
    }

    return items;
  }

  private createItem(
    label: string,
    detail: string,
    insertText?: string,
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      label,
      vscode.CompletionItemKind.Property,
    );
    item.detail = detail;
    if (insertText) {
      item.insertText = insertText;
    }
    return item;
  }

  private isUnderKey(
    document: vscode.TextDocument,
    position: vscode.Position,
    key: string,
  ): boolean {
    for (let i = position.line - 1; i >= 0; i--) {
      const line = document.lineAt(i).text;
      if (line.startsWith(key + ":")) return true;
      if (line.match(/^[a-z]/i) && !line.startsWith(" ")) return false;
    }
    return false;
  }
}
