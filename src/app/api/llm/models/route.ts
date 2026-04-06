import { NextResponse } from "next/server";
import { listLocalModels } from "@/lib/local-llm";

export async function GET() {
  const models = await listLocalModels();
  return NextResponse.json({ models });
}
