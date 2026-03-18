import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export interface TxnRow {
  id: string;
  date: string;
  month: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  category: string;
  necessity: string;
  merchantKey: string;
  isTransfer: boolean;
  userTagged: boolean;
  confidence: string;
  statementId: string;
  filename: string;
  analysedAt: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month    = searchParams.get("month");     // filter by YYYY-MM
  const category = searchParams.get("category");  // filter by category
  const type     = searchParams.get("type");       // debit | credit
  const limit    = parseInt(searchParams.get("limit") ?? "2000");

  const db = getDb();

  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (month)    { conditions.push("month = @month");       params.month    = month; }
  if (category) { conditions.push("category = @category"); params.category = category; }
  if (type)     { conditions.push("type = @type");         params.type     = type; }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC LIMIT @limit`)
    .all({ ...params, limit }) as (Omit<TxnRow, "isTransfer" | "userTagged"> & { isTransfer: number; userTagged: number })[];

  const result: TxnRow[] = rows.map(r => ({
    ...r,
    isTransfer: r.isTransfer === 1,
    userTagged: r.userTagged === 1,
  }));

  const total = (db.prepare(`SELECT COUNT(*) as n FROM transactions ${where}`).get(params) as { n: number }).n;

  return NextResponse.json({ transactions: result, total });
}
