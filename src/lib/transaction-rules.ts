import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const RULES_FILE = path.join(process.cwd(), "data", "transaction-rules.json");

export interface TransactionRule {
  id: string;
  pattern: string;   // case-insensitive substring match against raw description
  label: string;     // human-readable name, e.g. "Rent"
  category: string;
  necessity: string;
  isTransfer?: boolean;
}

export async function loadRules(): Promise<TransactionRule[]> {
  try {
    const text = await fs.readFile(RULES_FILE, "utf-8");
    return JSON.parse(text) as TransactionRule[];
  } catch {
    return [];
  }
}

export async function saveRules(rules: TransactionRule[]): Promise<void> {
  await fs.mkdir(path.dirname(RULES_FILE), { recursive: true });
  await fs.writeFile(RULES_FILE, JSON.stringify(rules, null, 2), "utf-8");
}

export async function addRule(rule: Omit<TransactionRule, "id">): Promise<TransactionRule> {
  const rules = await loadRules();
  const newRule = { ...rule, id: randomUUID() };
  rules.push(newRule);
  await saveRules(rules);
  return newRule;
}

export async function deleteRule(id: string): Promise<boolean> {
  const rules = await loadRules();
  const filtered = rules.filter(r => r.id !== id);
  if (filtered.length === rules.length) return false;
  await saveRules(filtered);
  return true;
}

export async function updateRule(id: string, patch: Partial<Omit<TransactionRule, "id">>): Promise<boolean> {
  const rules = await loadRules();
  const idx = rules.findIndex(r => r.id === id);
  if (idx === -1) return false;
  rules[idx] = { ...rules[idx], ...patch };
  await saveRules(rules);
  return true;
}

/** Returns the first matching rule for a given description, or null. */
export function matchRule(description: string, rules: TransactionRule[]): TransactionRule | null {
  const lower = description.toLowerCase();
  return rules.find(r => lower.includes(r.pattern.toLowerCase())) ?? null;
}
