import fs from "fs/promises";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), "data", "config.json");

export interface AppConfig {
  latestAnalyzedDate?: string; // YYYY-MM-DD — everything up to and including this date is analysed
  selectedModel?: string;      // "local:gemma4:e2b" | "claude:claude-sonnet-4-6" | "openai:gpt-5"
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const text = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(text) as AppConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<void> {
  const existing = await loadConfig();
  const merged = { ...existing, ...patch };
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
}
