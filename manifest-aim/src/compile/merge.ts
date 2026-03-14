/**
 * Manifest merge engine — combines multiple manifests using composition strategies.
 */

import type {
  RawManifest,
  RawRule,
  RawCapability,
  RawKnowledgeUnit,
  CompositionStrategy,
  Conflict,
} from "./types.js";

const SEVERITY_ORDER: Record<string, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

const ACTION_STRICTNESS: Record<string, number> = {
  log: 0,
  warn: 1,
  transform: 2,
  retry: 3,
  require_approval: 4,
  escalate: 5,
  block: 6,
};

/**
 * Determine which value is "more restrictive" for governance fields.
 */
function moreRestrictiveValue(
  field: string,
  a: unknown,
  b: unknown,
): unknown {
  // For numeric fields where lower = stricter
  if (
    field.includes("max_complexity") ||
    field.includes("max_file_length") ||
    field.includes("max_length") ||
    field.includes("max_null_percentage") ||
    field.includes("max_reading_level")
  ) {
    return Math.min(Number(a), Number(b));
  }

  // For numeric fields where higher = stricter
  if (
    field.includes("test_coverage_minimum") ||
    field.includes("min_length")
  ) {
    return Math.max(Number(a), Number(b));
  }

  // For boolean fields, true is stricter
  if (typeof a === "boolean" && typeof b === "boolean") {
    return a || b;
  }

  // For action fields
  if (field === "action") {
    const aStrict = ACTION_STRICTNESS[String(a)] ?? 0;
    const bStrict = ACTION_STRICTNESS[String(b)] ?? 0;
    return aStrict >= bStrict ? a : b;
  }

  // For severity fields
  if (field === "severity") {
    const aOrder = SEVERITY_ORDER[String(a)] ?? 0;
    const bOrder = SEVERITY_ORDER[String(b)] ?? 0;
    return aOrder >= bOrder ? a : b;
  }

  // Default: take the later value (last_wins behavior as fallback)
  return b;
}

/**
 * Merge two governance rules with the same name.
 */
function mergeRule(
  base: RawRule,
  override: RawRule,
  strategy: CompositionStrategy,
  sourceBase: string,
  sourceOverride: string,
  conflicts: Conflict[],
): RawRule {
  const merged = { ...base };

  for (const [key, overrideValue] of Object.entries(override)) {
    if (key === "name") continue; // Name is the identity, never changes
    const baseValue = (base as Record<string, unknown>)[key];

    // No conflict if base doesn't have the field
    if (baseValue === undefined) {
      (merged as Record<string, unknown>)[key] = overrideValue;
      continue;
    }

    // No conflict if values are the same
    if (JSON.stringify(baseValue) === JSON.stringify(overrideValue)) continue;

    // We have a conflict — resolve based on strategy
    let resolvedValue: unknown;
    let resolution: string;

    switch (strategy) {
      case "most_restrictive":
        resolvedValue = moreRestrictiveValue(key, baseValue, overrideValue);
        resolution = `most_restrictive: chose ${JSON.stringify(resolvedValue)}`;
        break;

      case "last_wins":
        resolvedValue = overrideValue;
        resolution = `last_wins: ${sourceOverride} overrides ${sourceBase}`;
        break;

      case "priority_weighted": {
        const basePriority = base.priority ?? 0;
        const overridePriority = override.priority ?? 0;
        if (overridePriority >= basePriority) {
          resolvedValue = overrideValue;
          resolution = `priority_weighted: ${sourceOverride} (priority ${overridePriority}) beats ${sourceBase} (priority ${basePriority})`;
        } else {
          resolvedValue = baseValue;
          resolution = `priority_weighted: ${sourceBase} (priority ${basePriority}) beats ${sourceOverride} (priority ${overridePriority})`;
        }
        break;
      }

      case "strict_fail":
        throw new Error(
          `CONFLICT [strict_fail]: Rule "${base.name}" field "${key}" — ` +
          `${sourceBase} has ${JSON.stringify(baseValue)}, ` +
          `${sourceOverride} has ${JSON.stringify(overrideValue)}`,
        );

      default:
        resolvedValue = overrideValue;
        resolution = "default: last value used";
    }

    conflicts.push({
      field: `governance.rules[${base.name}].${key}`,
      sources: [
        { manifest: sourceBase, value: baseValue },
        { manifest: sourceOverride, value: overrideValue },
      ],
      resolution,
      resolvedValue,
    });

    (merged as Record<string, unknown>)[key] = resolvedValue;
  }

  return merged;
}

/**
 * Merge arrays of named items (capabilities, knowledge units).
 * Items with the same name are merged; unique items are appended.
 */
function mergeNamedArray<T extends { name: string }>(
  base: T[],
  additions: T[],
  strategy: CompositionStrategy,
  section: string,
  sourceBase: string,
  sourceAddition: string,
  conflicts: Conflict[],
): T[] {
  const merged = new Map<string, T>();

  // Add all base items
  for (const item of base) {
    merged.set(item.name, { ...item });
  }

  // Merge or add new items
  for (const item of additions) {
    const existing = merged.get(item.name);
    if (!existing) {
      merged.set(item.name, { ...item });
    } else {
      // Conflict — item exists in both
      if (strategy === "strict_fail") {
        throw new Error(
          `CONFLICT [strict_fail]: ${section} "${item.name}" exists in both ${sourceBase} and ${sourceAddition}`,
        );
      }

      if (strategy === "last_wins") {
        merged.set(item.name, { ...item });
        conflicts.push({
          field: `${section}[${item.name}]`,
          sources: [
            { manifest: sourceBase, value: existing },
            { manifest: sourceAddition, value: item },
          ],
          resolution: `last_wins: ${sourceAddition} replaces ${sourceBase}`,
          resolvedValue: item,
        });
      } else {
        // For most_restrictive and priority_weighted on capabilities/knowledge,
        // merge field-by-field with last_wins semantics (these aren't governance)
        const mergedItem = { ...existing, ...item };
        merged.set(item.name, mergedItem);
        conflicts.push({
          field: `${section}[${item.name}]`,
          sources: [
            { manifest: sourceBase, value: existing },
            { manifest: sourceAddition, value: item },
          ],
          resolution: `merged field-by-field, ${sourceAddition} fields take precedence`,
          resolvedValue: mergedItem,
        });
      }
    }
  }

  return Array.from(merged.values());
}

/**
 * Merge quality gates using composition strategy.
 */
function mergeQualityGates(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
  strategy: CompositionStrategy,
  sourceBase: string,
  sourceOverride: string,
  conflicts: Conflict[],
): Record<string, unknown> {
  const merged = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;

  for (const [section, overrideSection] of Object.entries(override)) {
    if (!merged[section]) {
      merged[section] = overrideSection;
      continue;
    }

    const baseSection = merged[section] as Record<string, unknown>;
    const overrideSectionObj = overrideSection as Record<string, unknown>;

    for (const [key, overrideValue] of Object.entries(overrideSectionObj)) {
      const baseValue = baseSection[key];

      if (baseValue === undefined) {
        baseSection[key] = overrideValue;
        continue;
      }

      if (JSON.stringify(baseValue) === JSON.stringify(overrideValue)) continue;

      if (strategy === "strict_fail") {
        throw new Error(
          `CONFLICT [strict_fail]: quality_gates.${section}.${key} — ` +
          `${sourceBase} has ${JSON.stringify(baseValue)}, ` +
          `${sourceOverride} has ${JSON.stringify(overrideValue)}`,
        );
      }

      let resolvedValue: unknown;
      if (strategy === "most_restrictive") {
        resolvedValue = moreRestrictiveValue(key, baseValue, overrideValue);
      } else {
        resolvedValue = overrideValue;
      }

      conflicts.push({
        field: `governance.quality_gates.${section}.${key}`,
        sources: [
          { manifest: sourceBase, value: baseValue },
          { manifest: sourceOverride, value: overrideValue },
        ],
        resolution: `${strategy}: chose ${JSON.stringify(resolvedValue)}`,
        resolvedValue,
      });

      baseSection[key] = resolvedValue;
    }
  }

  return merged;
}

/**
 * Merge two manifests together.
 * `base` is the earlier/parent manifest, `override` is the later/child.
 */
export function mergeManifests(
  base: RawManifest,
  override: RawManifest,
  strategy: CompositionStrategy,
  sourceBase: string,
  sourceOverride: string,
  conflicts: Conflict[],
): RawManifest {
  // Start with the override's metadata (child's identity wins)
  const merged: RawManifest = {
    aim: override.aim ?? base.aim,
    metadata: { ...override.metadata },
  };

  // Merge context (override wins for simple fields)
  if (base.context || override.context) {
    merged.context = {
      ...(base.context ?? {}),
      ...(override.context ?? {}),
    };
  }

  // Merge capabilities
  const baseCaps = base.capabilities ?? [];
  const overrideCaps = override.capabilities ?? [];
  if (baseCaps.length > 0 || overrideCaps.length > 0) {
    merged.capabilities = mergeNamedArray<RawCapability>(
      baseCaps, overrideCaps, strategy,
      "capabilities", sourceBase, sourceOverride, conflicts,
    );
  }

  // Merge knowledge
  const baseKnowledge = base.knowledge ?? [];
  const overrideKnowledge = override.knowledge ?? [];
  if (baseKnowledge.length > 0 || overrideKnowledge.length > 0) {
    merged.knowledge = mergeNamedArray<RawKnowledgeUnit>(
      baseKnowledge, overrideKnowledge, strategy,
      "knowledge", sourceBase, sourceOverride, conflicts,
    );
  }

  // Merge governance
  if (base.governance || override.governance) {
    const baseGov = base.governance ?? {};
    const overrideGov = override.governance ?? {};

    merged.governance = {};

    // Merge rules
    const baseRules = baseGov.rules ?? [];
    const overrideRules = overrideGov.rules ?? [];
    if (baseRules.length > 0 || overrideRules.length > 0) {
      const ruleMap = new Map<string, RawRule>();

      for (const rule of baseRules) {
        ruleMap.set(rule.name, { ...rule });
      }

      for (const rule of overrideRules) {
        const existing = ruleMap.get(rule.name);
        if (!existing) {
          ruleMap.set(rule.name, { ...rule });
        } else {
          const mergedRule = mergeRule(
            existing, rule, strategy,
            sourceBase, sourceOverride, conflicts,
          );
          ruleMap.set(rule.name, mergedRule);
        }
      }

      merged.governance.rules = Array.from(ruleMap.values());
    }

    // Merge quality gates
    if (baseGov.quality_gates || overrideGov.quality_gates) {
      merged.governance.quality_gates = mergeQualityGates(
        (baseGov.quality_gates ?? {}) as Record<string, unknown>,
        (overrideGov.quality_gates ?? {}) as Record<string, unknown>,
        strategy, sourceBase, sourceOverride, conflicts,
      );
    }

    // Transforms, guardrails, audit: child overrides or extends
    if (baseGov.transforms || overrideGov.transforms) {
      merged.governance.transforms = [
        ...(baseGov.transforms ?? []),
        ...(overrideGov.transforms ?? []),
      ];
    }
    if (overrideGov.guardrails || baseGov.guardrails) {
      merged.governance.guardrails = overrideGov.guardrails ?? baseGov.guardrails;
    }
    if (overrideGov.audit || baseGov.audit) {
      merged.governance.audit = {
        ...(baseGov.audit ?? {}),
        ...(overrideGov.audit ?? {}),
      };
    }
    if (overrideGov.retry_policy || baseGov.retry_policy) {
      merged.governance.retry_policy = {
        ...(baseGov.retry_policy ?? {}),
        ...(overrideGov.retry_policy ?? {}),
      };
    }
  }

  // Lifecycle: merge event hooks
  if (base.lifecycle || override.lifecycle) {
    merged.lifecycle = {
      ...(base.lifecycle ?? {}),
      ...(override.lifecycle ?? {}),
    };
  }

  // Runtime: child overrides
  if (base.runtime || override.runtime) {
    merged.runtime = {
      ...(base.runtime ?? {}),
      ...(override.runtime ?? {}),
    };
  }

  // Don't carry forward inherits/dependencies/composition/overrides
  // Those are compile-time directives, not runtime config

  return merged;
}
