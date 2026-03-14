// This file contains intentional violations for testing enforcement.
// DO NOT fix these — they exist to prove the enforcement engine works.

// Violation: no-eval (pattern: eval() usage)
const result = eval("2 + 2");

// Violation: no-any-type (pattern: `: any`)
function processData(input: any): any {
  return input;
}

// Violation: no-console-in-production (pattern: console.log)
console.log("debug output");
console.warn("warning output");

// Violation: no-empty-catch (pattern: empty catch block)
try {
  JSON.parse("invalid");
} catch (err) {}

// Violation: no-sql-injection (pattern: string concatenation in query)
function getUser(db: any, userId: string) {
  return db.query(`SELECT * FROM users WHERE id = ${userId}`);
}

export { result, processData, getUser };
