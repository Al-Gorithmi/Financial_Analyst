import { NextRequest, NextResponse } from "next/server";
import { loadConfig, saveConfig } from "@/lib/config-storage";

export async function GET() {
  const config = await loadConfig();
  return NextResponse.json(config);
}

export async function PATCH(req: NextRequest) {
  try {
    const patch = await req.json();
    await saveConfig(patch);
    const updated = await loadConfig();
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
