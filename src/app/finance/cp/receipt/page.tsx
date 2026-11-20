import { requireSession } from "@/lib/auth";
import { PaymentReceipt } from "@/components/payment-receipt";

export const dynamic = "force-dynamic";

export default async function CashPaymentReceipt({ searchParams }: { searchParams: Promise<{ id?: string; sr?: string }> }) {
  await requireSession();
  return <PaymentReceipt vtype="CP" title="CASH PAYMENT RECEIPT" base="/finance/cp" maxSrno={50} p={await searchParams} />;
}
