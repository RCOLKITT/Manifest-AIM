// Library code — console.log should be flagged here
console.log("debug leak in library");
export function helper(): string { return "ok"; }
