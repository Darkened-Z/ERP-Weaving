import { Shell } from "@/components/shell";
import { ConversionCalculator } from "./calculator";

export const dynamic = "force-dynamic";

export default async function GreyConversionCalculatorPage() {
  return (
    <Shell active="int-c-calc">
      <ConversionCalculator />
    </Shell>
  );
}
