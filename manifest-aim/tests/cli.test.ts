import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLI = join(__dirname, "..", "dist", "cli", "index.js");
const FIXTURES = join(__dirname, "fixtures");
const REF_MANIFESTS = join(__dirname, "..", "manifests", "reference");

function run(args: string, options?: { cwd?: string }): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      cwd: options?.cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout || err.stderr || "", exitCode: err.status || 1 };
  }
}

describe("CLI: manifest --help", () => {
  it("should display help text", () => {
    const { stdout, exitCode } = run("--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Manifest");
    expect(stdout).toContain("Define it. Manifest it.");
  });

  it("should display version", () => {
    const { stdout, exitCode } = run("--version");
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("0.1.0");
  });
});

describe("CLI: manifest validate", () => {
  it("should pass minimal valid manifest", () => {
    const { stdout, exitCode } = run(`validate ${join(FIXTURES, "minimal-valid.aim.yaml")}`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("✓");
    expect(stdout).toContain("is valid AIM v1.0");
  });

  it("should pass full valid manifest", () => {
    const { stdout, exitCode } = run(`validate ${join(FIXTURES, "full-valid.aim.yaml")}`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("✓");
    expect(stdout).toContain("full-valid@2.1.0");
  });

  it("should pass enterprise-typescript reference manifest", () => {
    const { stdout, exitCode } = run(`validate ${join(REF_MANIFESTS, "enterprise-typescript.aim.yaml")}`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("✓");
    expect(stdout).toContain("enterprise-typescript@1.0.0");
  });

  it("should show summary with counts", () => {
    const { stdout } = run(`validate ${join(REF_MANIFESTS, "enterprise-typescript.aim.yaml")}`);
    expect(stdout).toContain("Governance rules:");
    expect(stdout).toContain("Knowledge units:");
  });

  it("should fail on invalid AIM version", () => {
    const { stdout, exitCode } = run(`validate ${join(FIXTURES, "invalid-aim-version.aim.yaml")}`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("✗");
    expect(stdout).toContain("/aim");
  });

  it("should fail on missing required fields", () => {
    const { stdout, exitCode } = run(`validate ${join(FIXTURES, "invalid-missing-required.aim.yaml")}`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("✗");
  });

  it("should fail on bad semver", () => {
    const { stdout, exitCode } = run(`validate ${join(FIXTURES, "invalid-bad-semver.aim.yaml")}`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("/metadata/version");
  });

  it("should fail on bad name pattern", () => {
    const { stdout, exitCode } = run(`validate ${join(FIXTURES, "invalid-bad-name.aim.yaml")}`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("/metadata/name");
  });

  it("should fail on nonexistent file", () => {
    const { stdout, exitCode } = run("validate nonexistent.yaml");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("File not found");
  });

  it("should show warnings for semantic issues", () => {
    const { stdout, exitCode } = run(`validate ${join(FIXTURES, "warnings-expected.aim.yaml")}`);
    expect(exitCode).toBe(0); // valid but with warnings
    expect(stdout).toContain("⚠");
    expect(stdout).toContain("critical severity");
    expect(stdout).toContain("audit is not enabled");
  });

  it("should fail in --strict mode with warnings", () => {
    const { exitCode } = run(`validate --strict ${join(FIXTURES, "warnings-expected.aim.yaml")}`);
    expect(exitCode).toBe(1);
  });
});

describe("CLI: manifest init", () => {
  it("should create aim.yaml in empty directory", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-test-"));
    const { stdout, exitCode } = run("init", { cwd: tmpDir });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Created aim.yaml");
    expect(existsSync(join(tmpDir, "aim.yaml"))).toBe(true);
    expect(existsSync(join(tmpDir, ".aim"))).toBe(true);
  });

  it("should refuse to overwrite existing aim.yaml", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-test-"));
    run("init", { cwd: tmpDir }); // create first
    const { stdout, exitCode } = run("init", { cwd: tmpDir }); // try again
    expect(exitCode).toBe(1);
    expect(stdout).toContain("already exists");
  });

  it("should overwrite with --force", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-test-"));
    run("init", { cwd: tmpDir });
    const { stdout, exitCode } = run("init --force", { cwd: tmpDir });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Created aim.yaml");
  });

  it("should generate a valid manifest", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-test-"));
    run("init", { cwd: tmpDir });
    const { exitCode } = run(`validate ${join(tmpDir, "aim.yaml")}`);
    expect(exitCode).toBe(0);
  });

  it("should use directory name as project name", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "my-cool-project-"));
    run("init", { cwd: tmpDir });
    const content = readFileSync(join(tmpDir, "aim.yaml"), "utf-8");
    // The dir name will be like my-cool-project-XXXXX
    expect(content).toContain("name: my-cool-project-");
  });
});

describe("CLI: manifest inspect", () => {
  const manifest = join(REF_MANIFESTS, "enterprise-typescript.aim.yaml");

  it("should show tier 0 by default", () => {
    const { stdout, exitCode } = run(`inspect ${manifest}`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Tier 0");
    expect(stdout).toContain("Index");
    expect(stdout).toContain("Governance:");
  });

  it("should show tier 2 knowledge", () => {
    const { stdout, exitCode } = run(`inspect ${manifest} --tier 2`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Tier 2");
    expect(stdout).toContain("Knowledge units");
    expect(stdout).toContain("security-checklist");
  });

  it("should show token estimates with --tokens", () => {
    const { stdout, exitCode } = run(`inspect ${manifest} --tier 2 --tokens`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("tokens");
  });

  it("should fail on nonexistent file", () => {
    const { exitCode } = run("inspect nonexistent.yaml");
    expect(exitCode).toBe(1);
  });
});

describe("CLI: manifest doctor", () => {
  it("should run health check on valid manifest", () => {
    const { stdout, exitCode } = run(`doctor ${join(REF_MANIFESTS, "enterprise-typescript.aim.yaml")}`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Manifest Doctor");
    expect(stdout).toContain("Node.js");
    expect(stdout).toContain("Enforcement Tools");
  });

  it("should detect enforcement tools from manifest rules", () => {
    const { stdout } = run(`doctor ${join(REF_MANIFESTS, "enterprise-typescript.aim.yaml")}`);
    // The enterprise manifest uses semgrep and tsc
    expect(stdout).toContain("Semgrep");
    expect(stdout).toContain("TypeScript");
  });
});

describe("CLI: stub commands", () => {
  it("manifest compile should require valid manifest", () => {
    const { exitCode, stdout } = run("compile nonexistent.yaml");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("Manifest not found");
  });

  it("manifest enforce should require manifest file", () => {
    const { exitCode, stdout } = run("enforce ./src");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("Manifest not found");
  });

  it("manifest wrap should show coming soon", () => {
    const { stdout } = run("wrap claude-code");
    expect(stdout).toContain("coming in");
  });

  it("manifest publish should show coming soon", () => {
    const { stdout } = run("publish");
    expect(stdout).toContain("coming in");
  });

  it("manifest install should show coming soon", () => {
    const { stdout } = run("install some-package");
    expect(stdout).toContain("coming in");
  });
});
