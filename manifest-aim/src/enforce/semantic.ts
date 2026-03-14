/**
 * Semantic detection engine — LLM-as-judge enforcement.
 *
 * Uses Claude to evaluate code against natural language criteria.
 * This is what makes AIM fundamentally different from a linter:
 * rules like "does this follow clean architecture?" are enforceable.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SemanticDetect, Violation, GovernanceRule } from "./types.js";

const MODEL_MAP: Record<string, string> = {
  fast: "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-5-20241022",
  thorough: "claude-opus-4-0-20250514",
};

interface JudgeVerdict {
  pass: boolean;
  confidence: number;
  reason: string;
}

let clientInstance: Anthropic | null = null;
let clientChecked = false;

function getClient(): Anthropic | null {
  if (clientChecked) return clientInstance;
  clientChecked = true;

  // The SDK auto-discovers ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL from env.
  // If neither is set, skip gracefully.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!apiKey && !baseUrl) return null;

  try {
    clientInstance = new Anthropic();
    return clientInstance;
  } catch {
    return null;
  }
}

/**
 * Build the judge prompt from the rule's semantic detection config.
 */
function buildJudgePrompt(
  detect: SemanticDetect,
  filePath: string,
  content: string,
): string {
  let prompt = `You are an AI code judge. Evaluate the following code against the given criteria.

## Criteria
${detect.criteria}

## File
Path: ${filePath}

\`\`\`
${content}
\`\`\`
`;

  // Add few-shot examples if provided
  if (detect.examples && detect.examples.length > 0) {
    prompt += "\n## Examples\n";
    for (const example of detect.examples) {
      prompt += `\nInput: ${example.input}\nVerdict: ${example.verdict}`;
      if (example.reason) {
        prompt += `\nReason: ${example.reason}`;
      }
      prompt += "\n";
    }
  }

  prompt += `
## Instructions
Evaluate the code above against the criteria. Respond with ONLY a JSON object (no markdown, no explanation outside the JSON):

{
  "pass": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation of your verdict"
}

Be strict. If the code violates ANY part of the criteria, it fails.`;

  return prompt;
}

/**
 * Parse the judge's response into a structured verdict.
 */
function parseVerdict(response: string): JudgeVerdict {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*"pass"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Judge response did not contain valid JSON verdict");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    pass?: boolean;
    confidence?: number;
    reason?: string;
  };

  return {
    pass: parsed.pass ?? false,
    confidence: parsed.confidence ?? 0,
    reason: parsed.reason ?? "No reason provided",
  };
}

export interface SemanticResult {
  violations: Violation[];
  skipped: boolean;
  skipReason?: string;
}

/**
 * Run semantic detection against a file using LLM-as-judge.
 */
/** Reset cached client (for testing). */
export function __resetClient(): void {
  clientInstance = null;
  clientChecked = false;
}

export async function runSemanticDetection(
  rule: GovernanceRule,
  detect: SemanticDetect,
  filePath: string,
  content: string,
): Promise<SemanticResult> {
  const client = getClient();
  if (!client) {
    return {
      violations: [],
      skipped: true,
      skipReason: "No Anthropic credentials found. Set ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL.",
    };
  }

  const modelTier = detect.model ?? "fast";
  const model = MODEL_MAP[modelTier] ?? MODEL_MAP.fast;
  const threshold = detect.threshold ?? 0.8;

  const prompt = buildJudgePrompt(detect, filePath, content);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract text from response
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const verdict = parseVerdict(text);

    // Rule triggers when: code FAILS the criteria AND confidence meets threshold
    if (!verdict.pass && verdict.confidence >= threshold) {
      return {
        violations: [
          {
            rule: rule.name,
            file: filePath,
            message: rule.message ?? `Semantic check failed: ${rule.name}`,
            severity: rule.severity,
            action: rule.action,
            fix_hint: rule.fix_hint,
            match: `[${modelTier}] ${verdict.reason} (confidence: ${verdict.confidence})`,
          },
        ],
        skipped: false,
      };
    }

    return { violations: [], skipped: false };
  } catch (err) {
    const message = (err as Error).message;

    // Auth errors — report clearly
    if (message.includes("401") || message.includes("authentication") || message.includes("api_key")) {
      return {
        violations: [],
        skipped: true,
        skipReason: "Anthropic API authentication failed. Check your ANTHROPIC_API_KEY.",
      };
    }

    // Rate limits or transient errors — skip gracefully
    return {
      violations: [],
      skipped: true,
      skipReason: `Semantic enforcement error: ${message}`,
    };
  }
}
