import fs from "fs/promises";
import path from "path";

const TAGS_FILE = path.join(process.cwd(), "data", "merchant-tags.json");

export type MerchantTags = Record<string, string>; // merchantKey → category

export async function loadMerchantTags(): Promise<MerchantTags> {
  try {
    const text = await fs.readFile(TAGS_FILE, "utf-8");
    return JSON.parse(text) as MerchantTags;
  } catch {
    return {};
  }
}

export async function saveMerchantTag(merchantKey: string, category: string): Promise<void> {
  const tags = await loadMerchantTags();
  tags[merchantKey.toUpperCase()] = category;
  await fs.mkdir(path.dirname(TAGS_FILE), { recursive: true });
  await fs.writeFile(TAGS_FILE, JSON.stringify(tags, null, 2), "utf-8");
}
