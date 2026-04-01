import { NextRequest, NextResponse } from "next/server";
import { updateTransaction } from "@/lib/analysis-storage";
import { saveMerchantTag } from "@/lib/merchant-tags";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ month: string; txnId: string }> }
) {
  try {
    const { month, txnId } = await params;
    const body = await req.json() as {
      category?: string;
      necessity?: string;
      isTransfer?: boolean;
      type?: "debit" | "credit";
      merchantKey?: string;
    };

    const { category, necessity, isTransfer, type, merchantKey } = body;

    if (category === undefined && necessity === undefined && isTransfer === undefined && type === undefined) {
      return NextResponse.json({ error: "at least one field required" }, { status: 400 });
    }

    const patch: Parameters<typeof updateTransaction>[2] = {};
    if (category !== undefined) patch.category = category;
    if (necessity !== undefined) patch.necessity = necessity;
    if (isTransfer !== undefined) patch.isTransfer = isTransfer;
    if (type !== undefined) patch.type = type;

    const ok = await updateTransaction(month, txnId, patch);
    if (!ok) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    // Persist merchant → category mapping for future analyses
    if (category && merchantKey) {
      await saveMerchantTag(merchantKey, category);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[analyses/month/transactions/txnId] PATCH", err);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}
