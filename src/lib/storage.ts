import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { RawTxnRow } from "./parse-table";

const DATA_DIR = path.join(process.cwd(), "data", "statements");

export interface Statement {
  id: string;
  filename: string;
  uploadedAt: string;
  numPages: number;
  rawText: string;
  scrubbedText: string;
  redactionCount: number;
  approved: boolean;
  parsedTransactions?: RawTxnRow[]; // parsed from rawText markdown table at save time
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function saveStatement(
  data: Omit<Statement, "id" | "uploadedAt">
): Promise<Statement> {
  await ensureDir();
  const statement: Statement = {
    id: randomUUID(),
    uploadedAt: new Date().toISOString(),
    ...data,
  };
  const filePath = path.join(DATA_DIR, `${statement.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(statement, null, 2), "utf-8");
  return statement;
}

export async function loadStatement(id: string): Promise<Statement | null> {
  try {
    const filePath = path.join(DATA_DIR, `${id}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Statement;
  } catch {
    return null;
  }
}

export async function listStatements(): Promise<
  Omit<Statement, "rawText" | "scrubbedText">[]
> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const statements: Omit<Statement, "rawText" | "scrubbedText">[] = [];

  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
    const { rawText: _r, scrubbedText: _s, parsedTransactions: _p, ...meta } = JSON.parse(raw);
    statements.push(meta);
  }

  return statements.sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

export async function deleteStatement(id: string): Promise<boolean> {
  try {
    await fs.unlink(path.join(DATA_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
