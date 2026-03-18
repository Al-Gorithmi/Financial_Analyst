import { NextResponse } from "next/server";
import { loadRecurring, saveRecurring, detectAndSaveRecurring } from "@/lib/recurring";

export async function GET() {
  const items = await loadRecurring();
  return NextResponse.json(items);
}

// PATCH /api/recurring  body: { id, confirmed?, dismissed? }
export async function PATCH(req: Request) {
  const { id, confirmed, dismissed } = await req.json();
  const items = await loadRecurring();
  const idx = items.findIndex(r => r.id === id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (confirmed !== undefined) items[idx].confirmed = confirmed;
  if (dismissed !== undefined) items[idx].dismissed = dismissed;
  await saveRecurring(items);
  return NextResponse.json(items[idx]);
}

// POST /api/recurring  — re-run detection
export async function POST() {
  const items = await detectAndSaveRecurring();
  return NextResponse.json(items);
}
