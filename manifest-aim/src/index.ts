/**
 * Manifest — The Agent Instruction Manifest Platform
 *
 * @module manifest-aim
 * @version 0.1.0
 * @license SEE LICENSE IN LICENSE
 *
 * This is the public API for the Manifest runtime library.
 * Use this to embed AIM protocol support in agent frameworks.
 */

export { validateCommand } from "./cli/commands/validate.js";
export { initCommand } from "./cli/commands/init.js";
export { inspectCommand } from "./cli/commands/inspect.js";
export { doctorCommand } from "./cli/commands/doctor.js";
export { enforceCommand } from "./cli/commands/enforce.js";
export { compileCommand } from "./cli/commands/compile.js";
export { enforce } from "./enforce/engine.js";
export { compile } from "./compile/compiler.js";
export type { EnforceSummary, Violation } from "./enforce/types.js";
export type { CompileResult, Conflict } from "./compile/types.js";
