# Manifest

**The Agent Instruction Manifest Platform**

> *Define it. Manifest it.*

Manifest is the platform that implements the **AIM (Agent Instruction Manifest)** protocol — a portable, composable, progressively-loaded specification that tells AI agents what they can do, how to do it well, and what they must never do.

## The Problem

AI agents today operate with fragmented instructions. MCP burns tokens loading every tool schema upfront. Skills files are local and non-portable. Rules files are static with no conditional logic. System prompts are ephemeral. The result: you can't trust agent output meets your standards.

## The Solution

AIM unifies four concerns into a single manifest:

| Concern | What it answers | Today's fragmented approach |
|---------|----------------|---------------------------|
| **Capabilities** | What can the agent do? | MCP servers, tool definitions |
| **Knowledge** | How should it approach the work? | Skills files, system prompts |
| **Governance** | What must/must not it do? | Rules files, hope |
| **Execution** | How does it actually run? | MCP, CLI, REST, code |

### Progressive Disclosure (Why Token Burn Dies)

AIM uses four tiers. Agents only load what they need, when they need it:

| Tier | Token Cost | When Loaded |
|------|-----------|-------------|
| 0 — Index | ~5 per item | Always |
| 1 — Schema | ~50-200 per item | On relevance match |
| 2 — Instructions | Variable | On commitment |
| 3 — Execution | 0 (never enters context) | On dispatch |

**50 capabilities via MCP:** ~25,000 tokens burned upfront.
**50 capabilities via AIM:** ~250 tokens at init. 99% reduction.

### Enforceable Governance (Why "Hope" Dies)

AIM governance isn't a suggestion. Three enforcement mechanisms ensure compliance:

- **Static Analysis** — Real tools (semgrep, ESLint, tsc) validate output. Deterministic. High trust.
- **Semantic (LLM-as-Judge)** — A second LLM evaluates against nuanced rules. Generalizable. Medium trust.
- **Injected** — Rules injected into agent context. Zero overhead. For style/preference guidance.

## Quick Start

```bash
# Install
npm install -g manifest-aim

# Initialize a manifest in your project
manifest init

# Validate your manifest
manifest validate

# Compile (resolve dependencies, check conflicts)
manifest compile

# Health check
manifest doctor

# Wrap an agent with AIM enforcement
manifest wrap claude-code
```

## Example `aim.yaml`

```yaml
aim: "1.0"

metadata:
  name: my-project-standards
  version: 1.0.0
  description: "Production TypeScript development standards"

context:
  domain: software-engineering
  environment: production
  compliance: [soc2]

governance:
  rules:
    - name: no-hardcoded-secrets
      enforcement: static
      detect:
        type: tool
        command: "semgrep --config=p/secrets --json {{file}}"
        match_condition: "results.length > 0"
      action: block
      severity: critical
      message: "Hardcoded secrets detected. Use environment variables."

    - name: strict-typescript
      enforcement: static
      detect:
        type: tool
        command: "npx tsc --noEmit --strict {{file}}"
        exit_code_fail: non-zero
      action: block
      severity: error

    - name: clean-architecture
      enforcement: semantic
      detect:
        type: semantic
        criteria: "Domain modules must not import from infrastructure layers"
        model: fast
        threshold: 0.9
      action: warn
      severity: warning

  quality_gates:
    code:
      test_coverage_minimum: 80
      require_types: strict
      max_complexity: 10
      require_error_handling: true
      require_logging: structured

knowledge:
  - name: security-checklist
    trigger: "creating API endpoints, auth flows, or data handlers"
    content: |
      Before delivering code that handles user input or sensitive data:
      1. All inputs validated (use zod schemas)
      2. Auth middleware on protected routes
      3. Rate limiting on public endpoints
      4. Secrets from environment, never hardcoded
      5. SQL queries parameterized
      6. Error responses never leak internals
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `manifest init` | Create a new `aim.yaml` in current directory |
| `manifest validate` | Validate manifest against AIM JSON Schema |
| `manifest compile` | Resolve dependencies, detect conflicts, produce compiled manifest |
| `manifest inspect` | Show what an agent sees at each tier |
| `manifest doctor` | Verify tools, auth, and environment health |
| `manifest wrap <agent>` | Wrap an agent with AIM enforcement |
| `manifest enforce <path>` | Run enforcement checks standalone |
| `manifest publish` | Publish manifest to Manifest Registry |
| `manifest install <name>` | Install manifest from registry |
| `manifest audit` | Show governance report |
| `manifest generate` | Auto-generate manifest from project analysis (via Rebar) |

## Product Family

| Product | Role |
|---------|------|
| **AIM** | The protocol — the instruction language for AI agents |
| **Manifest** | The platform — CLI, runtime, registry, enterprise governance |
| **Rebar** | The generator — analyzes projects, outputs `aim.yaml` automatically |

## Documentation

- [AIM Protocol Specification](docs/SPECIFICATION.md)
- [Enforcement Architecture](docs/ENFORCEMENT.md)
- [Manifest Schema Reference](docs/SCHEMA.md)
- [Writing Your First Manifest](docs/GETTING_STARTED.md)
- [Reference Manifests](manifests/reference/)

## License

Copyright © 2026 Vaspera Capital. All rights reserved.

See [LICENSE](LICENSE) for details.
