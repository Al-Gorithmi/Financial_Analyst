import { NextRequest, NextResponse } from "next/server";
import { parsePDF } from "@/lib/pdf-parser";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, numPages } = await parsePDF(buffer);

    return NextResponse.json({ text, numPages });
  } catch (err) {
    console.error("[parse-pdf]", err);
    return NextResponse.json(
      { error: "Failed to parse PDF" },
      { status: 500 }
    );
  }
}
