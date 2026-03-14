// This file should pass all enforcement rules — no violations.

interface User {
  id: string;
  name: string;
  email: string;
}

function getUserById(repo: { findById: (id: string) => User | null }, userId: string): User | null {
  return repo.findById(userId);
}

function formatUser(user: User): string {
  return `${user.name} <${user.email}>`;
}

export { getUserById, formatUser };
export type { User };
