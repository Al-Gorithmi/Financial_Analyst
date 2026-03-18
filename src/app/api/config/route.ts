import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config-storage";

export async function GET() {
  const config = await loadConfig();
  return NextResponse.json(config);
}
