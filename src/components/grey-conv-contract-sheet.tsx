import { PrintHeader, SignatureRow } from "@/components/print-shell";

// The Oracle WVG_GREY_CONV_CONTRACT sheet (owner 2026-10): header fields, the
// costing box, grey description pairs, then warp | weft yarn side by side.
// Shared by the EXT and internal contracts (same columns) and rendered off
// screen on the entry pages so WA can share the open contract as an image.

type Contract = {
  contNo: string;
  contDate: string;
  expDate: string | null;
  status: string;
  party: string | null;
  seasonType: string | null;
  qtyMtr: number | null;
  ratePerPick: number | null;
  rateMtr: number | null;
  costLakhaiBorderMtr: number | null;
  read: number | null;
  pick: number | null;
  width: number | null;
  grayQltyCode: string | null;
  grayCode: string | null;
  remarks: string | null;
  weaveFrame: string | null;
  loomType: string | null;
  selvType: string | null;
  slvName: string | null;
  designNo: string | null;
  productName: string | null;
  productQuality: string | null;
  warpWtPerMtr: number | null;
  weftWtPerMtr: number | null;
  wtPerMtr: number | null;
  warpCostPerMtr: number | null;
  weftCostPerMtr: number | null;
  costPerMtr: number | null;
  convRatePerMtr: number | null;
  grayRatePerMtr: number | null;
  wrpWt40: number | null;
  wftWt40: number | null;
  weight40: number | null;
};

type Yarn = {
  id: number;
  count: string | null;
  descr: string | null;
  brand: string | null;
  calCount: number | null;
  ends: number | null;
  wtPerMtr: number | null;
  ratePerLbs: number | null;
  costPerMtr: number | null;
};

const num = (n: number | null | undefined, dp: number) =>
  n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: dp }).format(n);
const dmy = (s: string | null | undefined) => (s ? s.split("-").reverse().join("-") : "");

const BOX = "border border-black px-1.5 py-0.5 min-h-[20px]";

function Field({ label, value, wide, right }: { label: string; value: React.ReactNode; wide?: boolean; right?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0" style={{ width: 92 }}>{label}</span>
      <span className={`${BOX} ${right ? "text-right mono" : ""}`} style={{ flex: wide ? 1 : "0 0 120px" }}>{value}</span>
    </div>
  );
}

// Inline cell styles: the global th/td rules (and their phone media query)
// would otherwise resize the cells and blow the captured layout.
const CELL: React.CSSProperties = { border: "1px solid #000", padding: "2px 4px", fontSize: 10, lineHeight: 1.25, color: "#000", whiteSpace: "normal", textTransform: "none", letterSpacing: 0 };
const COLS = [40, 0, 64, 42, 42, 62, 46, 62];

function YarnTable({ title, rows }: { title: string; rows: Yarn[] }) {
  const th = { ...CELL, fontWeight: 600, background: "#eee", textAlign: "center" } as const;
  const r = { ...CELL, textAlign: "right" } as const;
  const ends = rows.reduce((s, x) => s + (x.ends ?? 0), 0);
  return (
    <div>
      <div className="text-[13px] font-bold tracking-[0.15em] mb-1">{title}</div>
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <colgroup>
          {COLS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            {["Y.Code", "Count Des", "Brand", "Cal Count", "Ends", "WT Per Mtr", "Rate Per Lbs", "Cost Per Mtr"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td className="mono" style={{ ...CELL, textAlign: "center" }}>{x.count}</td>
              <td style={CELL}>{x.descr}</td>
              <td style={CELL}>{x.brand}</td>
              <td className="mono" style={r}>{num(x.calCount, 2)}</td>
              <td className="mono" style={r}>{x.ends}</td>
              <td className="mono" style={r}>{num(x.wtPerMtr, 6)}</td>
              <td className="mono" style={r}>{num(x.ratePerLbs, 2)}</td>
              <td className="mono" style={r}>{num(x.costPerMtr, 4)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...CELL, fontWeight: 700 }} colSpan={4}>Total</td>
            <td className="mono" style={{ ...r, fontWeight: 700 }}>{ends}</td>
            <td style={CELL} colSpan={3}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function GreyConvContractSheet({
  id,
  title,
  contract: c,
  warp,
  weft,
}: {
  id: string;
  title: string;
  contract: Contract;
  warp: Yarn[];
  weft: Yarn[];
}) {
  const pairs = Array.from({ length: Math.max(1, warp.length, weft.length) }, (_, i) => [warp[i]?.descr ?? "", weft[i]?.descr ?? ""]);
  const costing: [string, string][] = [
    ["Warp WT Per Mtr", num(c.warpWtPerMtr, 6)],
    ["Weft WT Per Mtr", num(c.weftWtPerMtr, 6)],
    ["WT Per Mtr", num(c.wtPerMtr, 6)],
    ["Warp Cost Per Mtr", num(c.warpCostPerMtr, 4)],
    ["Weft Cost Per Mtr", num(c.weftCostPerMtr, 4)],
    ["Cost Per Mtr", num(c.costPerMtr, 4)],
    ["Conv. Rate Per Mtr", num(c.convRatePerMtr, 2)],
    ["Gray Rate Per Mtr", num(c.grayRatePerMtr, 2)],
  ];

  return (
    <div id={id} className="bg-white text-black p-6 text-[11px]" style={{ width: 1060 }}>
      <PrintHeader title={title} />

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 230px 270px" }}>
        <div className="flex flex-col gap-1">
          <div className="flex gap-6">
            <Field label="Contract No" value={c.contNo} />
            <Field label="S. Type" value={c.seasonType} />
          </div>
          <Field label="Status" value={c.status} />
          <Field label="Party" value={c.party} wide />
          <Field label="Qty Mtr" value={num(c.qtyMtr, 2)} right />
          <div className="flex gap-6">
            <Field label="Rate/Pick" value={num(c.ratePerPick, 4)} right />
            <Field label="Rate/Mtr" value={num(c.rateMtr, 2)} right />
          </div>
          <Field label="Cost Lakhai Border / Mtr" value={num(c.costLakhaiBorderMtr, 2)} right />
          <div className="flex items-center gap-2 mt-1">
            <span className="shrink-0" style={{ width: 92 }}>Grey Desc</span>
            <span className={`${BOX} mono text-right`} style={{ width: 60 }}>{num(c.read, 2)}</span>
            <span>X</span>
            <span className={`${BOX} mono`} style={{ width: 60 }}>{num(c.pick, 2)}</span>
            <span className="ml-4">Grey Code</span>
            <span className={`${BOX} mono`} style={{ width: 90 }}>{c.grayQltyCode ?? c.grayCode}</span>
          </div>
          {pairs.map(([wp, wf], i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`${BOX} text-right`} style={{ flex: 1 }}>{wp}</span>
              <span>X</span>
              <span className={BOX} style={{ flex: 1 }}>{wf}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <span className="shrink-0" style={{ width: 92 }}>Remarks</span>
            <span className={BOX} style={{ flex: 1 }}>{c.remarks}</span>
          </div>
          <div className="flex justify-end gap-3 mt-1">
            {([["Reed", c.read], ["Pick", c.pick], ["Width", c.width]] as const).map(([k, v]) => (
              <div key={k} className="flex flex-col items-center">
                <span className="text-[10px]">{k}</span>
                <span className={`${BOX} mono text-right`} style={{ width: 60 }}>{num(v, 2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {([
            ["Contract Date", dmy(c.contDate)],
            ["Expiry Date", dmy(c.expDate)],
            ["Weave", c.weaveFrame],
            ["Loom Type", c.loomType],
            ["Selvage", c.selvType],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="shrink-0" style={{ width: 84 }}>{k}</span>
              <span className={`${BOX} mono text-center`} style={{ flex: 1 }}>{v}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-2">
            <span className="shrink-0" style={{ width: 84 }}>Design No</span>
            <span className="flex-1 bg-black text-white text-center font-bold text-[22px] py-1">{c.designNo || "—"}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="border border-black rounded-lg p-2 flex flex-col gap-1">
            {costing.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="flex-1">{k}</span>
                <span className={`${BOX} mono text-right`} style={{ width: 100 }}>{v}</span>
              </div>
            ))}
          </div>
          {([["Prd. Quality", c.productQuality], ["Prd. Desc.", c.productName], ["Slv. Name", c.slvName]] as const).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="shrink-0" style={{ width: 70 }}>{k}</span>
              <span className={BOX} style={{ flex: 1 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-6 my-3 items-center">
        {([["Warp WT / 40 Mtr", c.wrpWt40], ["Weft WT / 40 Mtr", c.wftWt40], ["Total WT / 40 Mtr", c.weight40]] as const).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span>{k}</span>
            <span className={`${BOX} mono text-right font-bold`} style={{ width: 70 }}>{num(v, 2)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <YarnTable title="WARP" rows={warp} />
        <YarnTable title="WEFT" rows={weft} />
      </div>

      <SignatureRow labels={["Prepared By", "Checked By", "Approved By"]} />
    </div>
  );
}
