/**
 * Semantic detection engine — LLM-as-judge enforcement.
 *
 * Uses Vercel AI SDK for multi-provider support (Anthropic, OpenAI, etc.)
 * This is what makes AIM fundamentally different from a linter:
 * rules like "does this follow clean architecture?" are enforceable.
 */

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { SemanticDetect, Violation, GovernanceRule } from "./types.js";

interface JudgeVerdict {
  pass: boolean;
  confidence: number;
  reason: string;
}

type ProviderType = "anthropic" | "openai" | null;

let providerChecked = false;
let activeProvider: ProviderType = null;

/**
 * Detect which AI provider is available based on environment variables.
 */
function detectProvider(): ProviderType {
  if (providerChecked) return activeProvider;
  providerChecked = true;

  // Check Anthropic first (preferred)
  if (process.env.ANTHROPIC_API_KEY) {
    activeProvider = "anthropic";
    return activeProvider;
  }

  // Fallback to OpenAI
  if (process.env.OPENAI_API_KEY) {
    activeProvider = "openai";
    return activeProvider;
  }

  return null;
}

/**
 * Get the appropriate model for the tier and provider.
 */
function getModel(tier: string, provider: ProviderType) {
  if (provider === "anthropic") {
    const anthropic = createAnthropic();
    switch (tier) {
      case "fast":
        return anthropic("claude-haiku-4-5-20251001");
      case "standard":
        return anthropic("claude-sonnet-4-5-20241022");
      case "thorough":
        return anthropic("claude-opus-4-0-20250514");
      default:
        return anthropic("claude-haiku-4-5-20251001");
    }
  }

  if (provider === "openai") {
    const openai = createOpenAI();
    switch (tier) {
      case "fast":
        return openai("gpt-4o-mini");
      case "standard":
        return openai("gpt-4o");
      case "thorough":
        return openai("gpt-4o");
      default:
        return openai("gpt-4o-mini");
    }
  }

  throw new Error("No provider available");
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

/** Reset cached provider (for testing). */
export function __resetClient(): void {
  providerChecked = false;
  activeProvider = null;
}

/**
 * Run semantic detection against a file using LLM-as-judge.
 */
export async function runSemanticDetection(
  rule: GovernanceRule,
  detect: SemanticDetect,
  filePath: string,
  content: string,
): Promise<SemanticResult> {
  const provider = detectProvider();
  if (!provider) {
    return {
      violations: [],
      skipped: true,
      skipReason: "No AI provider found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
    };
  }

  const modelTier = detect.model ?? "fast";
  const threshold = detect.threshold ?? 0.8;
  const prompt = buildJudgePrompt(detect, filePath, content);

  try {
    const model = getModel(modelTier, provider);

    const { text } = await generateText({
      model,
      prompt,
    });

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
            match: `[${provider}:${modelTier}] ${verdict.reason} (confidence: ${verdict.confidence})`,
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
        skipReason: `${provider} API authentication failed. Check your API key.`,
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
