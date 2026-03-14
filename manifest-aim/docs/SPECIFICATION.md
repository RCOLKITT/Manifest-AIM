# AIM Protocol + Manifest Platform

## The Agent Instruction Manifest Protocol & The Platform That Makes It Real

**Protocol Version:** 0.2.0-draft
**Product:** Manifest by Vaspera Capital
**Author:** Ryan
**Date:** March 2026

**AIM** is the protocol — the open specification for how agents receive instructions, knowledge, and governance.
**Manifest** is the platform — the CLI, runtime, registry, compiler, and enterprise toolchain that implements AIM.
**Rebar** is the generator — it analyzes your project and produces the right AIM manifest automatically.

> *"Define it. Manifest it."*

---

# PART 1: THE AIM PROTOCOL (SPECIFICATION)

---

## 1. The Problem

Every AI agent today operates with fragmented, incomplete, and front-loaded instructions. The result: users cannot trust that agent output meets their actual requirements — whether that's security standards, brand voice, coding conventions, compliance rules, or domain expertise.

The current landscape forces users to cobble together:

- **MCP servers** for typed tool access (but burns tokens upfront and adds transport complexity)
- **Skills files** for procedural knowledge (but they're local, non-portable, and tool-specific)
- **Rules files** for behavioral constraints (but they're static, global, and have no conditional logic)
- **System prompts** for persona and context (but they're ephemeral and non-composable)
- **CLI tools** for execution (but output is untyped and parsing is brittle)

No single format unifies these concerns. No format implements intelligent loading. No format is portable across agent platforms. And critically — no format gives users confidence that the agent is operating within defined, verifiable boundaries.

**AIM solves this.** It is a protocol and portable manifest format that tells any AI agent everything it needs to know — what it can do, how to do it well, what it must and must not do, and how to execute — using a progressive disclosure model that eliminates token waste.

### What AIM Replaces (and Doesn't)

AIM does not replace MCP, CLIs, or APIs. It sits above them as a **unified instruction and governance layer**.

| Layer | Concern | Examples |
|-------|---------|---------|
| **AIM** | What to do, how, and within what boundaries | `aim.yaml` manifest files |
| **Transport** | How to execute | MCP, CLI, REST, gRPC, code |
| **Infrastructure** | Where to execute | Cloud, local, edge |

AIM is transport-agnostic. MCP servers, CLI tools, and REST APIs become interchangeable execution targets underneath AIM's instruction layer.

---

## 2. Core Design Principles

### Principle 1: Progressive Disclosure (Tiered Loading)

An agent should never pay for context it doesn't need. AIM uses four tiers:

| Tier | Name | Token Cost | When Loaded | What It Contains |
|------|------|-----------|-------------|-----------------|
| 0 | Index | ~5 per item | Always (at init) | Name, tags, one-line description |
| 1 | Schema | ~50-200 per item | On relevance match | Typed inputs/outputs, preconditions, constraints |
| 2 | Instruction | Variable | On commitment to use | Full how-to, best practices, examples, edge cases |
| 3 | Execution | 0 tokens | On dispatch | Actual execution target — never enters context window |

**Impact:** 50 capabilities at Tier 0 = ~250 tokens. Same 50 capabilities as MCP tool schemas = ~25,000+ tokens. That is a **99% reduction** in baseline context cost.

### Principle 2: Transport Agnosticism

AIM doesn't care how capabilities execute. A capability's Tier 3 dispatch can target:

- An MCP server (for teams already invested in MCP infrastructure)
- A CLI command (for Unix-native workflows)
- A REST API (for direct HTTP calls)
- Inline code (for computed/dynamic operations)
- Another agent (for multi-agent delegation)

The agent sees a typed capability with known inputs, outputs, and constraints. It never sees transport details.

### Principle 3: Zero Infrastructure

An AIM manifest is a file. YAML or JSON. No server to run, no process to manage, no initialization handshake. It lives in a repo, a package registry, or a URL. Any agent that understands the AIM protocol can consume it.

### Principle 4: Composability

AIM manifests can inherit from, extend, and override other manifests. An organization defines a base manifest, a team layers domain-specific capabilities, and an individual adds preferences — all without duplication, with explicit conflict resolution.

### Principle 5: Conditional Governance

Rules aren't global and static. They activate based on context — environment, user role, data classification, time, or any custom condition. Production gets strict guardrails. Development gets freedom. The same manifest handles both.

### Principle 6: Enforceable (Not Advisory)

This is where AIM fundamentally diverges from skills, rules files, and system prompts. AIM governance is not a suggestion the agent may or may not follow. It is enforced through a hybrid architecture with three enforcement mechanisms, each appropriate to different rule types.

---

## 3. The Enforcement Architecture

The hardest problem in agent governance is: **who actually enforces the rules?** Telling an LLM "don't use any types" is a suggestion. Enforcing it requires architecture.

AIM defines three enforcement mechanisms. Every governance rule declares which mechanism(s) apply.

### Mechanism 1: Static Analysis (Deterministic)

**What it does:** Runs real tools (linters, scanners, validators) against agent output. Pass/fail is binary and trustworthy.

**Best for:** Code quality, security patterns, formatting, dependency validation, license compliance, secrets detection.

**How it works:** After the agent produces output, the Manifest runtime pipes it through declared static analysis tools before delivery.

```yaml
governance:
  rules:
    - name: no-any-types
      enforcement: static
      detect:
        type: tool
        command: "npx tsc --noEmit --strict {{file}}"
        exit_code_fail: non-zero
      action: block
      severity: error
      message: "TypeScript strict mode violations detected"

    - name: no-hardcoded-secrets
      enforcement: static
      detect:
        type: tool
        command: "semgrep --config=p/secrets --json {{file}}"
        match_condition: "results.length > 0"
      action: block
      severity: critical
      message: "Hardcoded secrets detected. Use environment variables."

    - name: no-console-logs
      enforcement: static
      detect:
        type: pattern
        match: "console\\.(log|debug|info)\\("
        scope: output
      action: block
      when: environment == "production"
```

**Trust level:** High. Deterministic. The tool either finds the pattern or it doesn't.

### Mechanism 2: LLM-as-Judge (Semantic)

**What it does:** A second LLM pass evaluates the agent's output against semantic rules that can't be expressed as patterns or static checks.

**Best for:** Content tone/voice, architectural decisions, business logic correctness, compliance with nuanced guidelines, "does this make sense" checks.

**How it works:** The Manifest runtime sends the agent's output plus the rule's criteria to a lightweight judge model. The judge returns a structured verdict (pass/fail/warning + explanation).

```yaml
governance:
  rules:
    - name: brand-voice-compliance
      enforcement: semantic
      detect:
        type: semantic
        criteria: |
          Evaluate whether this content follows the brand voice guidelines:
          - Professional but approachable tone
          - No jargon without explanation
          - No superlatives without supporting data
          - No fear-based messaging
        model: fast
        threshold: 0.8
      action: warn
      severity: warning
      message: "Content may not align with brand voice guidelines"

    - name: architecture-review
      enforcement: semantic
      detect:
        type: semantic
        criteria: |
          Evaluate whether this code follows clean architecture:
          - Domain logic is separated from infrastructure
          - Dependencies point inward (domain has no external imports)
          - No business logic in controllers/handlers
        model: standard
        threshold: 0.9
      action: warn
      severity: warning
```

**Trust level:** Medium. Probabilistic but generalizable to any domain.

**Cost control:** Judge calls use the cheapest model that meets the threshold. Most semantic rules can be evaluated by small/fast models. The runtime batches multiple rules into a single judge call where possible.

### Mechanism 3: Agent Self-Enforcement (Injected)

**What it does:** Injects governance rules directly into the agent's context as instructions. The agent is told what to do and not do.

**Best for:** Behavioral guidance, stylistic preferences, workflow instructions — anything where "usually follows the rule" is acceptable and enforcement overhead isn't justified.

**How it works:** During the EXPAND phase (Tier 1 loading), relevant governance rules are injected into the agent's context as system-level instructions.

```yaml
governance:
  rules:
    - name: prefer-composition
      enforcement: injected
      instruction: |
        Prefer composition over inheritance in all object-oriented code.
        Use dependency injection for testability.
        If you find yourself creating a class hierarchy deeper than 2 levels,
        refactor to use composition instead.
      severity: info

    - name: explain-tradeoffs
      enforcement: injected
      instruction: |
        When making architectural decisions, always explain the tradeoffs
        considered and why this approach was chosen over alternatives.
      severity: info
```

**Trust level:** Low-Medium. The agent usually complies but may not always. Acceptable for rules where deviation is annoying but not dangerous.

### Enforcement Layering

Rules can declare multiple enforcement mechanisms as a chain:

```yaml
governance:
  rules:
    - name: no-sql-injection
      enforcement:
        primary: static
        fallback: semantic
      detect:
        static:
          type: tool
          command: "semgrep --config=p/sql-injection {{file}}"
        semantic:
          type: semantic
          criteria: "Check for string concatenation in SQL queries"
      action: block
      severity: critical
```

The runtime tries `primary` first. If the static tool can't analyze the output format (e.g., unsupported language), it falls back to `semantic`.

### Enforcement Decision Matrix

| Rule Type | Recommended Enforcement | Trust | Cost | Latency |
|-----------|------------------------|-------|------|---------|
| Code patterns (secrets, types, lint) | Static | High | Low | Low |
| Security vulnerabilities | Static + Semantic fallback | High | Low-Med | Low-Med |
| Architecture decisions | Semantic | Medium | Medium | Medium |
| Content tone/voice | Semantic | Medium | Medium | Medium |
| Compliance (regulatory) | Static + Semantic (both) | High | Medium | Medium |
| Style preferences | Injected | Low-Med | Zero | Zero |
| Workflow guidance | Injected | Low-Med | Zero | Zero |
| Data classification | Static (schema) + Semantic | High | Low-Med | Low-Med |

---

## 4. Detection Modes

The `detect` field in governance rules must be executable, not aspirational. AIM supports four detection modes:

### Mode 1: Pattern Detection

Regex or glob matching against agent output. Deterministic, zero-cost.

```yaml
detect:
  type: pattern
  match: "(api_key|secret|password|token)\\s*[=:]\\s*['\"][^'\"]{8,}['\"]"
  scope: output          # output | input | both
  file_types: [ts, js, py, yaml, json, env]
```

### Mode 2: Tool Detection

External tool execution. Leverages the massive ecosystem of existing linters, scanners, and validators.

```yaml
detect:
  type: tool
  command: "semgrep --config=p/secrets --json {{file}}"
  match_condition: "results.length > 0"
  exit_code_fail: non-zero
  timeout: 30s
  install: "pip install semgrep"
```

### Mode 3: Semantic Detection

LLM-based evaluation for rules that can't be expressed as patterns or tool checks.

```yaml
detect:
  type: semantic
  criteria: |
    Evaluate whether this code properly separates domain logic
    from infrastructure concerns. Domain modules should have
    zero imports from infrastructure, database, or HTTP layers.
  model: fast
  threshold: 0.8
  examples:
    - input: "import { db } from '../infrastructure/database'"
      verdict: fail
      reason: "Domain module imports from infrastructure layer"
    - input: "class OrderService { constructor(private repo: OrderRepository) {} }"
      verdict: pass
      reason: "Uses dependency injection, no direct infrastructure import"
```

### Mode 4: Composite Detection

Chain multiple detection modes for high-confidence enforcement.

```yaml
detect:
  type: composite
  strategy: all_must_pass    # all_must_pass | any_must_pass | weighted
  checks:
    - type: pattern
      match: "\\beval\\b|\\bexec\\b"
      weight: 0.3
    - type: tool
      command: "bandit -r {{file}} --format json"
      weight: 0.4
    - type: semantic
      criteria: "Does this code execute arbitrary user-supplied strings?"
      weight: 0.3
  threshold: 0.6
```

---

## 5. Governance Actions

When a rule's detection triggers, the action defines what happens:

| Action | Behavior | Use Case |
|--------|----------|----------|
| `block` | Prevents delivery. Agent must fix and retry. | Security violations, compliance failures |
| `warn` | Delivers with visible warning to user. | Style deviations, best practice suggestions |
| `require_approval` | Pauses for human approval before delivery. | Production deployments, PII access |
| `escalate` | Notifies specified parties immediately. | Critical security, breach detection |
| `transform` | Automatically modifies the output. | Strip debug code, add headers, mask PII |
| `log` | Silently records for audit. No user-visible effect. | Telemetry, compliance audit trail |
| `retry` | Sends output back to agent with specific fix instructions. | Auto-remediation loop |

### The Transform Action (Post-Processing)

Transforms make Manifest an active quality improver, not just a gatekeeper:

```yaml
governance:
  transforms:
    - name: strip-debug-code
      when: environment == "production"
      detect:
        type: pattern
        match: "console\\.(log|debug|warn)\\(.*\\)"
      action: transform
      transform:
        type: remove_match

    - name: add-file-headers
      when: file.is_new == true
      action: transform
      transform:
        type: inject
        position: top
        template: |
          /**
           * {{file.name}}
           * Generated: {{timestamp}}
           * AIM Manifest: {{manifest.name}} v{{manifest.version}}
           * Governance: {{rules_applied}}
           */

    - name: mask-pii-in-logs
      detect:
        type: pattern
        match: "\\b\\d{3}-\\d{2}-\\d{4}\\b"
      action: transform
      transform:
        type: replace
        replacement: "[REDACTED-SSN]"
        scope: log_output

    - name: auto-add-error-context
      detect:
        type: semantic
        criteria: "catch block that logs error without function name or request context"
      action: retry
      retry:
        instruction: |
          The catch block at {{location}} logs the error but doesn't include
          the function name or request context. Add structured error context:
          logger.error('{{function_name}} failed', { error, requestId, ...context })
        max_attempts: 2
```

---

## 6. The AIM Manifest Specification

### File Convention

The AIM manifest file is named `aim.yaml` (or `aim.json`). It lives at the root of a project, package, or repository.

```
my-project/
├── aim.yaml          ← The AIM manifest
├── .aim/             ← Local Manifest cache, compiled output, audit logs
│   ├── compiled.yaml
│   ├── cache/
│   └── audit/
├── src/
└── ...
```

### Complete Schema

```yaml
aim: "1.0"                         # Protocol version

# ─── METADATA ────────────────────────────────────────
metadata:
  name: string                     # Package name (kebab-case)
  version: semver                  # Semantic version
  description: string              # Human-readable description
  authors: [string]                # Contact/ownership
  tags: [string]                   # Discovery tags
  license: string                  # License identifier (SPDX)
  repository: url                  # Source repository
  homepage: url                    # Documentation/landing page
  checksum: sha256                 # Integrity verification

# ─── CONTEXT ─────────────────────────────────────────
# WHO is the agent, for WHOM, and under WHAT conditions?
context:
  persona: string                  # Agent's role identity
  audience: string | object        # Who the output serves
  domain: string                   # Business domain
  environment: string              # Runtime env (dev/staging/prod) — can be auto-detected
  organization: string             # Org identifier
  compliance: [string]             # Regulatory frameworks (hipaa, soc2, pci-dss, gdpr, sox)
  data_classification: [string]    # Sensitivity levels in use
  locale: string                   # Language/region
  variables:                       # Custom context variables (for conditional rules)
    key: value

# ─── CAPABILITIES ────────────────────────────────────
# WHAT can the agent do? (Four-tier progressive disclosure)
capabilities:
  - name: string                   # Unique capability identifier
    tags: [string]                 # Discovery tags (used in Tier 0 matching)
    index: string                  # One-line description (Tier 0, ~5 tokens)
    deprecated: boolean            # If true, warn on usage

    # ── Tier 1: Schema ──
    schema:
      inputs: object               # Named, typed parameters
      outputs: object              # Return type definition
      preconditions: [string]      # What must be true before invocation
      side_effects: [string]       # What this changes in the world
      idempotent: boolean          # Safe to retry?
      timeout: duration            # Max execution time
      rate_limit: string           # Max invocations per period

    # ── Tier 2: Instructions ──
    instructions: string | file    # Full how-to, best practices
    examples:                      # Usage examples
      - description: string
        input: object
        expected_output: object
    anti_patterns:                  # What NOT to do
      - description: string
        example: string

    # ── Tier 3: Dispatch ──
    dispatch:
      type: mcp | cli | rest | code | agent
      config: object               # Transport-specific configuration

      # MCP dispatch
      # config:
      #   server: url | command
      #   tool: string
      #   auth: object

      # CLI dispatch
      # config:
      #   command: string (with {{variable}} interpolation)
      #   working_dir: string
      #   env: object
      #   parse_output: jsonpath | regex | structured

      # REST dispatch
      # config:
      #   method: GET | POST | PUT | DELETE | PATCH
      #   url: string
      #   headers: object
      #   body_template: object
      #   response_map: object

      # Code dispatch
      # config:
      #   runtime: node | python | bash
      #   source: string | file
      #   dependencies: [string]

      # Agent dispatch (multi-agent)
      # config:
      #   agent: string (agent identifier)
      #   aim: string (AIM manifest for the sub-agent)
      #   delegation_mode: full | supervised

    # ── Capability-scoped constraints ──
    constraints:
      - when: condition
        unless: condition
        rule: string
        enforcement: static | semantic | injected

    requires: [string]             # Dependencies on other capabilities
    retry:
      max_attempts: number
      backoff: linear | exponential
      delay: duration

# ─── KNOWLEDGE ───────────────────────────────────────
# HOW should the agent approach work in this domain?
knowledge:
  - name: string                   # Knowledge unit identifier
    trigger: string                # Natural language — when to load this
    trigger_capabilities: [string] # Load when these capabilities activate
    priority: number               # Loading priority (higher = first)
    scope: [string]                # Which capabilities this applies to
    content: string | file         # The actual knowledge
    format: markdown | text | yaml # Content format
    max_tokens: number             # Budget limit for this knowledge unit
    ttl: duration                  # Cache duration before refresh

# ─── GOVERNANCE ──────────────────────────────────────
# WHAT MUST and MUST NOT the agent do?
governance:

  # ── Rules ──
  rules:
    - name: string                 # Rule identifier (kebab-case)
      description: string          # Human-readable explanation
      category: security | quality | compliance | style | safety | custom
      when: condition              # Activation condition (CEL expression)
      unless: condition            # Exception condition
      enforcement: static | semantic | injected | composite
      detect:                      # Detection configuration (see Section 4)
        type: pattern | tool | semantic | composite
        # ... type-specific config
      action: block | warn | require_approval | escalate | transform | log | retry
      severity: info | warning | error | critical
      message: string              # Explanation for agent/user
      fix_hint: string             # Actionable remediation guidance
      reference: url               # Link to policy documentation
      approvers: [string]          # For require_approval actions
      escalation_target: string    # For escalate actions
      tags: [string]               # Categorization tags

  # ── Transforms ──
  transforms:
    - name: string
      when: condition
      detect: object
      action: transform
      transform:
        type: remove_match | replace | inject | rewrite
        position: top | bottom | before_match | after_match
        template: string
        replacement: string
        scope: output | log_output | both

  # ── Guardrails (Input/Output Filtering) ──
  guardrails:
    input:
      - name: string
        detect: object
        action: block | transform | log
        message: string
    output:
      - name: string
        detect: object
        action: block | transform | log
        message: string

  # ── Quality Gates ──
  quality_gates:
    code:
      test_coverage_minimum: number
      require_types: boolean | strict
      max_complexity: number
      max_file_length: number
      require_error_handling: boolean
      require_logging: boolean | structured
      require_input_validation: boolean
      forbidden_patterns: [string]
      required_patterns: [string]
    content:
      max_reading_level: number
      require_citations: boolean
      max_length: number
      min_length: number
      tone_check: boolean
    data:
      require_schema_validation: boolean
      max_null_percentage: number
      require_data_types: boolean

  # ── Audit ──
  audit:
    enabled: boolean
    level: none | summary | detailed | forensic
    include:
      - capability_invocations
      - governance_decisions
      - enforcement_results
      - data_access
      - user_identity
      - timestamps
      - token_usage
      - model_used
    destination: string
    format: json | structured
    retention: duration
    tamper_proof: boolean
    pii_masking: boolean

  # ── Retry Policy ──
  retry_policy:
    max_global_retries: number
    retry_budget_tokens: number
    escalate_after: number

# ─── COMPOSITION ─────────────────────────────────────
dependencies:
  - aim: string                    # Package name
    version: semver_range
    registry: url
    override: object

inherits: [string]

composition:
  strategy: most_restrictive | last_wins | priority_weighted | strict_fail

overrides: object

# ─── LIFECYCLE ───────────────────────────────────────
lifecycle:
  on_init:
    - action: string
      config: object
  on_capability_load:
    - action: log | notify
      config: object
  on_governance_trigger:
    - action: log | notify | webhook
      config: object
  on_error:
    - action: string
      config: object
  on_complete:
    - action: string
      config: object
  on_escalation:
    - action: notify
      config: object

# ─── RUNTIME HINTS ───────────────────────────────────
runtime:
  token_budget: number
  tier1_cache_ttl: duration
  parallel_enforcement: boolean
  enforcement_timeout: duration
  judge_model: string
  judge_temperature: number
```

---

## 7. Runtime Loading Sequence

```
┌──────────────────────────────────────────────────────────────┐
│ 1. INIT                                                       │
│    Manifest loads aim.yaml                                    │
│    Reads ONLY: metadata + context + Tier 0 indexes + rules    │
│    Cost: ~50-200 tokens total                                 │
│    Time: <10ms                                                │
├──────────────────────────────────────────────────────────────┤
│ 2. MATCH                                                      │
│    User prompt arrives                                        │
│    Agent matches intent → Tier 0 indexes (name + tags + desc) │
│    Cost: 0 additional tokens                                  │
├──────────────────────────────────────────────────────────────┤
│ 3. EXPAND                                                     │
│    Load Tier 1 (schema) for matched capabilities              │
│    Load triggered knowledge units                             │
│    Inject "injected" enforcement rules into context           │
│    Evaluate conditional governance (which rules are active?)  │
│    Cost: ~200-1000 tokens (only relevant items)               │
├──────────────────────────────────────────────────────────────┤
│ 4. PLAN                                                       │
│    Agent plans its approach                                   │
│    Load Tier 2 (instructions) for committed capabilities      │
│    Apply quality gate requirements                            │
│    Cost: Variable (only committed capabilities)               │
├──────────────────────────────────────────────────────────────┤
│ 5. EXECUTE                                                    │
│    Dispatch via Tier 3 (execution config)                     │
│    Execution target handles the actual work                   │
│    Cost: 0 tokens (config never enters context)               │
├──────────────────────────────────────────────────────────────┤
│ 6. ENFORCE                                                    │
│    Run "static" enforcement (tools, patterns)                 │
│    Run "semantic" enforcement (LLM-as-judge)                  │
│    Apply transforms                                           │
│    If block → retry loop (back to step 4 with fix hints)      │
│    If warn → attach warnings to output                        │
│    If pass → proceed to delivery                              │
│    Cost: Varies by enforcement type                           │
├──────────────────────────────────────────────────────────────┤
│ 7. DELIVER                                                    │
│    Output delivered to user with governance report             │
│    Audit log written to .aim/audit/                           │
│    Lifecycle hooks fire (on_complete)                          │
└──────────────────────────────────────────────────────────────┘
```

### Token Budget Comparison

| Scenario | MCP (Today) | Manifest + AIM |
|----------|-------------|----------------|
| 50 tools, user needs 2 | ~25,000 tokens upfront | ~250 (Tier 0) + ~400 (2x Tier 1) + variable Tier 2 |
| 200 tools, user needs 5 | ~100,000+ tokens (exceeds many context windows) | ~1,000 (Tier 0) + ~1,000 (5x Tier 1) + variable Tier 2 |
| Same 50 tools, second query | ~25,000 tokens (reloaded) | ~250 (Tier 0 cached) + new Tier 1/2 only |

---

## 8. User Landscape (Personas)

AIM serves every scenario where a human delegates real work to an AI agent.

### Persona 1: Solo Developer
**Need:** "I prompt Claude Code and trust I get enterprise-secure, production-grade code."
**Manifest provides:** Coding standards, security checklist enforcement (static), architecture patterns (semantic), dependency rules (static), quality gates.

### Persona 2: Enterprise Engineering Team
**Need:** "All AI-assisted code across our org must pass compliance and standards."
**Manifest provides:** Org-wide manifests with inheritance, role-based capability scoping, approved technology enforcement, deployment pipeline rules, audit trail.

### Persona 3: Regulated Industry (Healthcare / Finance)
**Need:** "Agents handling patient/financial data must comply with HIPAA/SOX/FINRA with full audit."
**Manifest provides:** Data classification enforcement, PHI/PII handling rules, minimum necessary access, encryption requirements, breach escalation, 7-year audit retention.

### Persona 4: Content Creator / Marketing Team
**Need:** "My assistant knows brand voice, audience, and approval workflows."
**Manifest provides:** Brand knowledge units, tone enforcement (semantic), legal disclaimer injection (transform), competitor mention rules, approval workflows.

### Persona 5: DevOps / Platform Engineering
**Need:** "AI agents can observe anything but modify only with safeguards."
**Manifest provides:** Read/write permission tiers, blast radius limits, change window enforcement, rollback requirements, incident response escalation.

### Persona 6: Data Team / Analytics
**Need:** "Agents querying our warehouse respect data classification and produce reproducible analyses."
**Manifest provides:** PII masking transforms, query optimization knowledge, reproducibility standards, output format enforcement.

### Persona 7: Education
**Need:** "Student-facing agents guide learning without doing the work."
**Manifest provides:** Socratic method enforcement (semantic), complexity calibration, academic integrity rules, curriculum alignment knowledge.

### Persona 8: Agency / Consultancy
**Need:** "Switch entire agent context between Client X and Client Y projects."
**Manifest provides:** Client-scoped manifest switching, confidentiality walls (governance), client-specific rules inheritance.

### Persona 9: Open Source Maintainer
**Need:** "AI-assisted contributors automatically follow our standards."
**Manifest provides:** Contribution guidelines as enforceable rules, code style enforcement (static), PR format requirements, license compatibility checks.

### Persona 10: Security / Red Team
**Need:** "Security agents have tiered permissions with evidence chain-of-custody."
**Manifest provides:** Mode-based permission tiers (observe → test → exploit), scope boundaries, evidence logging, disclosure timeline enforcement.

---

## 9. Composition and Conflict Resolution

When manifests inherit or depend on each other, conflicts are inevitable. AIM handles this explicitly.

### Composition Strategies

```yaml
composition:
  strategy: most_restrictive  # DEFAULT for any manifest with compliance context
```

| Strategy | Behavior | Best For |
|----------|----------|----------|
| `most_restrictive` | Conflicting rules resolve to the stricter option | Regulated industries, security |
| `last_wins` | Later manifest in inheritance chain overrides earlier | Team customization |
| `priority_weighted` | Rules declare explicit priority (0-100), highest wins | Complex multi-team orgs |
| `strict_fail` | Any unresolved conflict is a compile error | Critical systems, audit-sensitive |

### Conflict Detection Examples

```
CONFLICT: acme-base says max_complexity: 15
          team-frontend says max_complexity: 10

Resolution (most_restrictive): max_complexity: 10 ✓

CONFLICT: base-rules says console.log → action: warn
          security-rules says console.log → action: block

Resolution (most_restrictive): action: block ✓

CONFLICT: team-a says language: typescript
          team-b says language: python

Resolution (strict_fail): ERROR — ambiguous conflict, must resolve explicitly ✗
```

### The Manifest Compiler

Before runtime, `manifest compile` performs:

1. Resolves all `inherits` and `dependencies`
2. Detects conflicts
3. Applies composition strategy
4. Produces a single, resolved manifest (`.aim/compiled.yaml`)
5. Reports warnings for overridden rules
6. Errors on unresolvable conflicts (in strict mode)

---

# PART 2: MANIFEST (THE PRODUCT)

---

## 10. Brand Identity

**Product Name:** Manifest
**By:** Vaspera Capital
**Protocol:** AIM (Agent Instruction Manifest)

**Tagline:** "Define it. Manifest it."

**Brand Voice:** Authoritative, precise, trustworthy. Manifest doesn't suggest — it ensures. The name itself is the value proposition: you declare what you need (the manifest), and the platform makes it real (manifests it).

**Naming Convention Across the Product:**

| Component | Name |
|-----------|------|
| Protocol | AIM |
| Product/Platform | Manifest |
| CLI | `manifest` |
| Config file | `aim.yaml` |
| Local directory | `.aim/` |
| Registry | Manifest Registry |
| Visual editor | Manifest Studio |
| Audit tool | Manifest Audit |
| Marketplace | Manifest Marketplace |
| Enterprise tier | Manifest Enterprise |
| Website | manifestaim.dev (or similar) |
| GitHub org | github.com/manifest-aim |
| npm scope | @manifest-aim |

**Product Family (Vaspera Capital):**

| Product | Role | Relationship |
|---------|------|-------------|
| **AIM** | The protocol | Open spec (after traction) |
| **Manifest** | The platform | CLI, runtime, registry, enterprise tools |
| **Rebar** | The generator | Analyzes projects → generates `aim.yaml` automatically |

---

## 11. Product Architecture

### Component Map

```
┌─────────────────────────────────────────────────────────┐
│                     MANIFEST                             │
│              by Vaspera Capital                           │
│                                                          │
│  ┌─────────────────────────────────────────┐            │
│  │          OPEN SOURCE CORE               │            │
│  │                                          │            │
│  │  manifest init     AIM Compiler          │            │
│  │  manifest validate   → resolve deps      │            │
│  │  manifest compile    → detect conflicts   │            │
│  │  manifest inspect    → optimize           │            │
│  │  manifest doctor                          │            │
│  │  manifest enforce    AIM Runtime          │            │
│  │  manifest wrap       → tiered loading     │            │
│  │                      → enforcement engine │            │
│  │                      → audit writer       │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
│  ┌─────────────────────────────────────────┐            │
│  │          COMMERCIAL PLATFORM             │            │
│  │                                          │            │
│  │  Manifest Registry   Manifest Studio     │            │
│  │  → publish           → visual editor     │            │
│  │  → discover          → drag/drop rules   │            │
│  │  → install           → live preview      │            │
│  │  → version           → team sharing      │            │
│  │                                          │            │
│  │  Manifest Audit      Manifest Enterprise │            │
│  │  → real-time dash    → SSO / RBAC        │            │
│  │  → compliance export → approval workflows│            │
│  │  → rule analytics    → SLA support       │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
│  ┌─────────────────────────────────────────┐            │
│  │          MARKETPLACE                     │  MONETIZE  │
│  │                                          │            │
│  │  Community + Commercial AIM Manifests    │            │
│  │  "HIPAA Pack" · "React 19 Standards"     │            │
│  │  "SOC2 Engineering" · "Brand Voice Pro"  │            │
│  │                                          │            │
│  │  70/30 revenue share (creator/platform)  │            │
│  └─────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
```

### CLI Commands

```bash
# Initialize a new aim.yaml in current project
$ manifest init

# Validate manifest syntax and schema
$ manifest validate

# Compile: resolve dependencies, check conflicts, produce .aim/compiled.yaml
$ manifest compile

# Inspect: show what the agent will see at each tier
$ manifest inspect --tier 0
$ manifest inspect --tier 1 --capability deploy-service
$ manifest inspect --tier 2 --capability deploy-service

# Health check: verify all detection tools are installed, auth is valid
$ manifest doctor

# Wrap an existing agent with AIM enforcement
$ manifest wrap claude-code
$ manifest wrap cursor
$ manifest wrap windsurf

# Run enforcement checks against a file or directory (standalone mode)
$ manifest enforce ./src -m aim.yaml
$ manifest enforce ./src -m aim.yaml -e production
$ manifest enforce ./src -m aim.yaml --report

# Publish to Manifest Registry
$ manifest publish

# Install a manifest from registry
$ manifest install hipaa-compliance-pack
$ manifest install @acme/engineering-base

# Show governance report for last task
$ manifest audit --last
$ manifest audit --export compliance-report.json

# Generate a manifest from project analysis (delegates to Rebar)
$ manifest generate
```

### Agent Platform Integration Strategy

**Phase 1 — Wrapper mode (Day 1):**

`manifest wrap claude-code` acts as middleware:

1. Loads and compiles the `aim.yaml`
2. Injects Tier 0 + relevant governance into agent context
3. Proxies to the underlying agent
4. Intercepts output for enforcement checks (static + semantic)
5. If blocked → retries with fix hints
6. Delivers validated output with governance report

This works TODAY with Claude Code, Cursor, Windsurf, and any agent that accepts context injection.

**Phase 2 — Plugin mode (Months 3-6):**

Native plugins/extensions for major platforms that implement tiered loading within the platform's architecture.

**Phase 3 — Native mode (Months 6-12):**

Platform vendors implement AIM protocol natively. The spec becomes a standard any agent framework can adopt.

### Open Source vs. Commercial Split

| Component | License | Rationale |
|-----------|---------|-----------|
| AIM spec | Proprietary → Open (after traction) | Control narrative first, open for adoption later |
| `manifest` CLI | Proprietary → Open (after traction) | Same strategy as spec |
| Manifest Compiler | Proprietary → Open (after traction) | Core toolchain follows spec |
| Manifest Runtime | Proprietary → Open (after traction) | Agent frameworks need to embed this |
| Reference manifests | Free (CC-BY) | Seed the ecosystem immediately |
| Manifest Registry | Freemium | Free for public, paid for private/org |
| Manifest Studio | Commercial | Visual editor for non-technical users |
| Manifest Audit | Commercial | Enterprise compliance and visibility |
| Manifest Marketplace | Revenue share | 70/30 (creator/platform) |
| Manifest Enterprise | Commercial | SSO, RBAC, SLA, support |

---

## 12. Moat and Competitive Defense

### Why Anthropic/OpenAI/Google Won't Just Build This

1. **Protocol neutrality.** AIM works across all platforms. No single vendor will build something that treats competitors' tools as first-class. Vaspera can.

2. **The registry is the moat.** Whoever builds the npm-for-agent-instructions first and reaches critical mass of published manifests creates an unassailable network effect.

3. **Enterprise governance.** Enterprises won't trust a vendor-specific governance layer. An open protocol with commercial tooling from an independent company is an easier procurement story.

4. **Speed.** The category window is open NOW. MCP backlash has created demand, and nobody has shipped the answer yet.

### Defensibility Layers

| Layer | Defensibility | Timeline |
|-------|--------------|----------|
| Spec + CLI | Low (intentionally — adoption matters) | Month 1 |
| Registry content | High (network effect) | Month 3+ |
| Enterprise features | Medium (switching costs) | Month 6+ |
| Marketplace | Very High (two-sided network) | Month 9+ |
| Community/brand | High (category = brand) | Ongoing |

---

## 13. Evaluation Framework

### Benchmark Suite: "Manifest vs. Naked Prompting"

50 identical coding tasks, each run with and without an AIM manifest:

| Metric | Measurement | Tool |
|--------|------------|------|
| Security vulnerabilities | Count of findings | Semgrep, Bandit, npm audit |
| Type safety | Strict mode violations | TypeScript compiler |
| Code quality | Complexity, duplication, lint | ESLint, SonarQube |
| Test coverage | Percentage | Jest/pytest coverage |
| Secrets exposure | Hardcoded credentials | TruffleHog, Gitleaks |
| Architecture adherence | Domain boundary violations | Custom semantic eval |
| Standards compliance | Deviation from org rules | Custom static rules |

**Success threshold:** ≥50% reduction in security findings, ≥40% improvement in type safety, ≥30% improvement in code quality. Publishable with reproducible methodology.

### Ongoing Metrics

| Metric | Target |
|--------|--------|
| Rule hit rate | Track most-triggered rules (identifies common agent mistakes) |
| Block-to-fix rate | ≥70% auto-remediation on first retry |
| False positive rate | <5% |
| Token overhead | Measure actual vs. theoretical savings |
| Time to delivery | Enforcement adds <15% latency |

---

## 14. Implementation Roadmap

### Phase 1: Foundation (Months 1-3)
**Milestone: "It works. I can prove it."**

- [x] Finalize AIM spec v1.0 as JSON Schema
- [x] Build `manifest` CLI: `init`, `validate`, `inspect`, `doctor`
- [x] Implement `manifest enforce` — pattern and tool detection against files
  - Pattern detection: regex matching with file type filtering, line/column reporting
  - Tool detection: external tool execution (tsc, semgrep) with exit code interpretation
  - Conditional governance: `when`/`unless` conditions evaluated against context
  - Actions enforced: block (exit 1), warn, log — with severity levels and fix hints
  - Environment override: `--environment` flag for production vs development rules
  - 33 tests covering unit, integration, and CLI layers
- [x] Create first reference manifest: `enterprise-typescript`
- [x] Build `manifest compile` — resolve `inherits`/`dependencies`, apply composition strategies
  - Inheritance chain resolution with circular dependency detection
  - Dependency resolution with local file path support
  - Four composition strategies: most_restrictive, last_wins, priority_weighted, strict_fail
  - Rule merging with field-level conflict resolution
  - Quality gate merging (stricter values win in most_restrictive)
  - Capability and knowledge unit merging by name
  - Override support (top-level and per-dependency)
  - Compiled output to .aim/compiled.yaml
  - 28 tests covering resolver, merge engine, compiler, CLI, and compile+enforce integration
- [ ] Implement semantic enforcement (LLM-as-judge detection mode)
- [ ] Implement composite detection mode
- [ ] Build `manifest wrap claude-code` — wrapper-mode runtime
- [ ] Implement Tier 0-3 progressive loading protocol in runtime
- [ ] Implement remaining actions: transform, require_approval, escalate, retry
- [ ] Create remaining reference manifests:
  - `hipaa-healthcare` — HIPAA-compliant agent operations
  - `soc2-engineering` — SOC2 engineering compliance
  - `react-best-practices` — React 19 development standards
  - `python-production` — Python production code standards
  - `devops-safety` — Infrastructure modification safeguards
  - `content-brand-voice` — Content creation with brand governance
  - `data-privacy` — Data team PII/classification rules
  - `security-assessment` — Red team tiered permissions
  - `open-source-contributor` — OSS contribution standards
- [ ] Run benchmark suite and publish results
- [ ] Documentation site (manifestaim.dev)
- [ ] Launch blog: "Introducing AIM — The Missing Instruction Layer for AI Agents"
- [ ] Launch blog: "Manifest: Define It. Manifest It."

### Phase 2: Ecosystem (Months 4-6)
**Milestone: "Others are building on it."**

- [ ] Manifest Registry (publish, discover, install)
- [ ] Composite detection mode
- [ ] `manifest generate` (delegates to Rebar for auto-manifest generation)
- [ ] Runtime adapters for Cursor and Windsurf
- [ ] GitHub Action: validate `aim.yaml` in CI/CD
- [ ] VS Code extension: `aim.yaml` editing with IntelliSense
- [ ] 50+ community manifests
- [ ] Conference talk / live demo

### Phase 3: Enterprise (Months 7-12)
**Milestone: "Enterprises are paying for it."**

- [ ] Manifest Studio (visual manifest editor)
- [ ] Manifest Audit (real-time governance dashboard)
- [ ] Role-based manifest scoping (RBAC)
- [ ] SSO integration
- [ ] Require_approval workflow engine
- [ ] Escalation routing
- [ ] SOC2 certification for Manifest platform itself
- [ ] Enterprise support tiers
- [ ] First 10 paying enterprise teams

### Phase 4: Category (Months 12-18)
**Milestone: "AIM is a recognized standard."**

- [ ] Manifest Marketplace (paid manifests, 70/30 revenue share)
- [ ] Open the AIM spec (Apache 2.0 or submit to foundation)
- [ ] Agent framework SDK (embed AIM runtime in any agent)
- [ ] Multi-agent AIM (agent-to-agent instruction passing)
- [ ] AIM certification program (for manifest authors)
- [ ] Native platform integrations

---

## 15. Success Criteria

### Product Success (12 months)

| Metric | Target |
|--------|--------|
| Registry manifests | 500+ published |
| Monthly active CLI users | 5,000+ |
| Enterprise teams | 10+ paying |
| Agent platforms supported | ≥3 (Claude Code, Cursor, Windsurf) |
| Benchmark improvement | ≥50% security finding reduction |

### Technical Success

| Metric | Target |
|--------|--------|
| Tier 0 load time | <10ms |
| Token reduction vs. MCP | ≥90% for equivalent surface |
| Enforcement false positive rate | <5% |
| Auto-remediation success rate | ≥70% first retry |
| MCP backward compatibility | Wrap any MCP server, zero changes |

### Category Success (18 months)

| Metric | Target |
|--------|--------|
| "AIM" in developer discourse | Recognized term |
| Third-party tools on AIM | ≥10 |
| Open spec published | Yes |
| Marketplace creators | 100+ |
| Rebar → AIM integration | Native output format |

---

## 16. The Rebar Connection

**Current state:** Rebar generates tool-specific config files (`.cursorrules`, `CLAUDE.md`, etc.)

**Future state:** Rebar generates `aim.yaml` manifests. The Rebar analysis engine understands a project's tech stack, dependencies, and patterns — and outputs an AIM manifest with:

- Appropriate governance rules for the detected stack
- Knowledge units for the frameworks in use
- Quality gates calibrated to the project's maturity
- Capability definitions for the project's toolchain

**User flow:**
```bash
# Rebar analyzes project and generates aim.yaml
$ manifest generate

# Or directly:
$ rebar generate --format aim

# Result: aim.yaml with governance, knowledge, and capabilities
# tailored to your specific project
```

**Positioning:**

| Product | What it is | One-liner |
|---------|-----------|-----------|
| **AIM** | The protocol | The instruction language for AI agents |
| **Manifest** | The platform | Define it. Manifest it. |
| **Rebar** | The generator | Intelligent AIM manifest generation |

---

## 17. Summary

**AIM** is the protocol that unifies agent instructions, knowledge, governance, and execution into a single, progressively-loaded, transport-agnostic, composable manifest format.

**Manifest** is the platform that makes AIM real — the CLI, compiler, runtime, registry, and enterprise governance layer that ensures AI agents meet your standard, every time.

**The category bet:** The era of "just add MCP to everything" is over. The era of "just add a rules file and hope" never worked. AIM replaces hope with enforcement. Manifest is the product that delivers it.

> *"Define it. Manifest it."*

---

*This document defines the AIM protocol and the Manifest product. Everything from here is execution.*
