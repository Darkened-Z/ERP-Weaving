import { requireSession } from "@/lib/auth";
import { PaymentReceipt } from "@/components/payment-receipt";

export const dynamic = "force-dynamic";

export default async function BankPaymentReceipt({ searchParams }: { searchParams: Promise<{ id?: string; sr?: string }> }) {
  await requireSession();
  return <PaymentReceipt vtype="BP" title="BANK PAYMENT RECEIPT" base="/finance/bp" maxSrno={100} p={await searchParams} />;
}
