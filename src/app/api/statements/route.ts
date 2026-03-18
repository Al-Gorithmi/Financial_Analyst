import { NextRequest, NextResponse } from "next/server";
import { listStatements, deleteStatement, saveStatement } from "@/lib/storage";
import { parseMarkdownTable, type RawTxnRow } from "@/lib/parse-table";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filename, numPages, rawText, scrubbedText, redactionCount } = body;

    if (!filename || !rawText || !scrubbedText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let parsedTransactions: RawTxnRow[] = [];
    try {
      parsedTransactions = parseMarkdownTable(rawText, new Date().toISOString());
    } catch (e) {
      console.warn("[statements] Failed to parse markdown table:", e);
    }

    const statement = await saveStatement({
      filename,
      numPages: numPages ?? 0,
      rawText,
      scrubbedText,
      redactionCount: redactionCount ?? 0,
      approved: true,
      parsedTransactions,
    });

    return NextResponse.json({ id: statement.id });
  } catch (err) {
    console.error("[statements POST]", err);
    return NextResponse.json({ error: "Failed to save statement" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const statements = await listStatements();
    return NextResponse.json({ statements });
  } catch (err) {
    console.error("[statements GET]", err);
    return NextResponse.json(
      { error: "Failed to list statements" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const deleted = await deleteStatement(id);
    if (!deleted) {
      return NextResponse.json({ error: "Statement not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[statements DELETE]", err);
    return NextResponse.json(
      { error: "Failed to delete statement" },
      { status: 500 }
    );
  }
}
