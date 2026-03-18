import { NextRequest, NextResponse } from "next/server";
import { updateTransactionCategory } from "@/lib/analysis-storage";
import { saveMerchantTag } from "@/lib/merchant-tags";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ month: string; txnId: string }> }
) {
  try {
    const { month, txnId } = await params;
    const { category, merchantKey } = await req.json() as {
      category: string;
      merchantKey?: string;
    };

    if (!category) {
      return NextResponse.json({ error: "category required" }, { status: 400 });
    }

    const ok = await updateTransactionCategory(month, txnId, category);
    if (!ok) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    // Persist merchant → category mapping for future analyses
    if (merchantKey) {
      await saveMerchantTag(merchantKey, category);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[analyses/month/transactions/txnId] PATCH", err);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}
