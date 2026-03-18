import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "transactions.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id                TEXT PRIMARY KEY,
      date              TEXT NOT NULL,
      month             TEXT NOT NULL,
      description       TEXT NOT NULL,
      cleanDescription  TEXT,
      amount            REAL NOT NULL,
      type              TEXT NOT NULL,
      category          TEXT,
      necessity         TEXT,
      merchantKey       TEXT,
      isTransfer        INTEGER NOT NULL DEFAULT 0,
      userTagged        INTEGER NOT NULL DEFAULT 0,
      confidence        TEXT,
      statementId       TEXT,
      filename          TEXT,
      analysedAt        TEXT,
      balance           REAL
    );
    CREATE INDEX IF NOT EXISTS idx_month ON transactions(month);
    CREATE INDEX IF NOT EXISTS idx_date  ON transactions(date);
  `);
  // Migrations for existing databases
  try { _db.exec(`ALTER TABLE transactions ADD COLUMN cleanDescription TEXT`); } catch { /* already exists */ }
  try { _db.exec(`ALTER TABLE transactions ADD COLUMN balance REAL`); } catch { /* already exists */ }
  return _db;
}
