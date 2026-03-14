/**
 * Retry/auto-remediation engine — uses LLM to suggest fixes for violations.
 *
 * Uses Vercel AI SDK for multi-provider support (Anthropic, OpenAI, etc.)
 * When a rule has action: "retry", the engine sends the violation context
 * to the LLM and asks for a fixed version of the code.
 */

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { Violation, RetryRule } from "./types.js";

export interface RetryResult {
  success: boolean;
  fixedContent?: string;
  explanation?: string;
  skipped: boolean;
  skipReason?: string;
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

  if (process.env.ANTHROPIC_API_KEY) {
    activeProvider = "anthropic";
    return activeProvider;
  }

  if (process.env.OPENAI_API_KEY) {
    activeProvider = "openai";
    return activeProvider;
  }

  return null;
}

/**
 * Get the fast model for the active provider.
 */
function getFastModel(provider: ProviderType) {
  if (provider === "anthropic") {
    return createAnthropic()("claude-haiku-4-5-20251001");
  }
  if (provider === "openai") {
    return createOpenAI()("gpt-4o-mini");
  }
  throw new Error("No provider available");
}

/**
 * Build the remediation prompt.
 */
function buildRemediationPrompt(
  violation: Violation,
  rule: RetryRule,
  originalContent: string,
): string {
  const customInstruction = rule.retry?.instruction ?? "";
  const context = violation.line
    ? extractContext(originalContent, violation.line, 5)
    : originalContent.slice(0, 1000);

  return `You are a code remediation assistant. Fix the following violation.

## Violation
- Rule: ${violation.rule}
- Message: ${violation.message}
- File: ${violation.file}
${violation.line ? `- Line: ${violation.line}` : ""}
${violation.match ? `- Match: ${violation.match}` : ""}
${violation.fix_hint ? `- Fix hint: ${violation.fix_hint}` : ""}

## Original Code Context
\`\`\`
${context}
\`\`\`

${customInstruction ? `## Additional Instructions\n${customInstruction}\n` : ""}

## Task
Provide the FIXED version of the code that resolves this violation.
Respond with ONLY a JSON object (no markdown):

{
  "fixed_code": "the complete fixed code snippet",
  "explanation": "brief explanation of what was changed"
}

Be minimal — only change what's necessary to fix the violation.`;
}

/**
 * Extract lines around a target line for context.
 */
function extractContext(content: string, targetLine: number, contextLines: number): string {
  const lines = content.split("\n");
  const start = Math.max(0, targetLine - contextLines - 1);
  const end = Math.min(lines.length, targetLine + contextLines);

  return lines
    .slice(start, end)
    .map((line, i) => {
      const lineNum = start + i + 1;
      const marker = lineNum === targetLine ? ">>>" : "   ";
      return `${marker} ${lineNum}: ${line}`;
    })
    .join("\n");
}

/**
 * Parse the remediation response.
 */
function parseRemediationResponse(response: string): { fixed_code?: string; explanation?: string } {
  try {
    const jsonMatch = response.match(/\{[\s\S]*"fixed_code"[\s\S]*\}/);
    if (!jsonMatch) {
      return {};
    }
    return JSON.parse(jsonMatch[0]) as { fixed_code?: string; explanation?: string };
  } catch {
    return {};
  }
}

/**
 * Attempt to auto-remediate a violation using LLM.
 */
export async function attemptRemediation(
  violation: Violation,
  rule: RetryRule,
  originalContent: string,
): Promise<RetryResult> {
  const provider = detectProvider();
  if (!provider) {
    return {
      success: false,
      skipped: true,
      skipReason: "No AI provider found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
    };
  }

  const prompt = buildRemediationPrompt(violation, rule, originalContent);

  try {
    const model = getFastModel(provider);

    const { text } = await generateText({
      model,
      prompt,
    });

    const parsed = parseRemediationResponse(text);

    if (parsed.fixed_code) {
      return {
        success: true,
        fixedContent: parsed.fixed_code,
        explanation: parsed.explanation,
        skipped: false,
      };
    }

    return {
      success: false,
      explanation: "Could not generate a fix",
      skipped: false,
    };
  } catch (err) {
    return {
      success: false,
      skipped: true,
      skipReason: `Remediation error: ${(err as Error).message}`,
    };
  }
}

/**
 * Generate fix suggestions for multiple violations.
 */
export async function generateFixSuggestions(
  violations: Violation[],
  rules: Map<string, RetryRule>,
  contents: Map<string, string>,
): Promise<Map<string, RetryResult>> {
  const results = new Map<string, RetryResult>();

  for (const violation of violations) {
    const rule = rules.get(violation.rule);
    if (!rule || rule.action !== "retry") {
      continue;
    }

    const content = contents.get(violation.file);
    if (!content) {
      continue;
    }

    const key = `${violation.file}:${violation.line ?? 0}:${violation.rule}`;
    const result = await attemptRemediation(violation, rule, content);
    results.set(key, result);
  }

  return results;
}

/** Reset provider for testing. */
export function __resetClient(): void {
  providerChecked = false;
  activeProvider = null;
}
