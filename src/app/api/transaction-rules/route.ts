import { NextRequest, NextResponse } from "next/server";
import { loadRules, addRule, deleteRule, updateRule } from "@/lib/transaction-rules";

export async function GET() {
  const rules = await loadRules();
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { pattern, label, category, necessity, isTransfer } = body;
  if (!pattern || !category || !necessity) {
    return NextResponse.json({ error: "pattern, category, and necessity are required" }, { status: 400 });
  }
  const rule = await addRule({ pattern, label: label || pattern, category, necessity, isTransfer: !!isTransfer });
  return NextResponse.json(rule, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...patch } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await updateRule(id, patch);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await deleteRule(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
