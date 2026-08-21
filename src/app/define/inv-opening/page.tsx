import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

const TAB_MAP: Record<string, string> = { YARN: "yarn", GREY: "grey", BEAM: "beam" };

export default async function InventoryOpeningPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; id?: string; adding?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab || "yarn";
  const isAdding = params.adding === "1";

  const rows = await db.select().from(schema.inventoryOpening).orderBy(schema.inventoryOpening.itemType, schema.inventoryOpening.entryDate);
  const yarnBrands = await db.select().from(schema.yarnBrands);
  const locations = await db.select().from(schema.locations);
  const greyConstructions = await db.select().from(schema.greyConstruction);
  const yarnBlends = await db.select().from(schema.yarnBlends);

  const yarnRows = rows.filter((r) => r.itemType === "YARN");
  const greyRows = rows.filter((r) => r.itemType === "GREY");
  const beamRows = rows.filter((r) => r.itemType === "BEAM");

  const selected = params.id ? rows.find((r) => r.id === parseInt(params.id!)) : null;
  const formItem = isAdding ? null : selected;

  const nextVoucherNo = isAdding && tab === "yarn"
    ? `YO-${String(
        Math.max(0, ...yarnRows.map((r) => {
          const m = r.voucherNo?.match(/YO-(\d+)/);
          return m ? parseInt(m[1], 10) : 0;
        })) + 1
      ).padStart(4, "0")}`
    : formItem?.voucherNo || "";

  async function saveEntry(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const itemType = (formData.get("item_type") as string)?.trim();
    const itemCode = (formData.get("item_code") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    if (!itemType || !itemCode || !description) return;

    const fyCode = (formData.get("fy_code") as string)?.trim();
    if (!fyCode) {
      redirect(`/define/inv-opening?tab=${TAB_MAP[itemType] || "yarn"}`);
    }

    const openingQty = num(formData.get("qty")) ?? 0;
    const openingRate = num(formData.get("rate")) ?? 0;
    const openingAmount = num(formData.get("amount")) ?? (openingQty * openingRate);
    const unit = (formData.get("unit") as string)?.trim() || (itemType === "YARN" ? "LBS" : "MTR");
    const location = (formData.get("location") as string)?.trim() || null;
    const entryDate = (formData.get("entry_date") as string)?.trim() || null;
    const doDate = (formData.get("do_date") as string)?.trim() || null;
    const status = (formData.get("status") as string)?.trim() || "A";
    const voucherNo = (formData.get("voucher_no") as string)?.trim() || null;
    const purContNo = (formData.get("pur_cont_no") as string)?.trim() || null;
    const opnParty = (formData.get("opn_party") as string)?.trim() || null;
    const convContNo = (formData.get("conv_cont_no") as string)?.trim() || null;
    const ratio = (formData.get("ratio") as string)?.trim() || null;
    const qtyWarp = num(formData.get("qty_warp"));
    const qtyWeft = num(formData.get("qty_weft"));
    const qtyBags = num(formData.get("qty_bags"));
    const brand = (formData.get("brand") as string)?.trim() || null;
    const remarks = (formData.get("remarks") as string)?.trim() || null;
    const grayWidth = num(formData.get("gray_width"));
    const weave = (formData.get("weave") as string)?.trim() || null;
    const designNo = (formData.get("design_no") as string)?.trim() || null;
    const loomType = (formData.get("loom_type") as string)?.trim() || null;
    const lvNo = (formData.get("lv_no") as string)?.trim() || null;
    const grayConstruction = (formData.get("gray_construction") as string)?.trim() || null;
    const blend = (formData.get("blend") as string)?.trim() || null;
    const productName = itemType === "GREY" ? description : null;
    const than = num(formData.get("than"));
    const rejection = num(formData.get("rejection"));
    const netMtr = num(formData.get("net_mtr"));
    const setNo = (formData.get("set_no") as string)?.trim() || null;
    const beamSetNo = (formData.get("beam_set_no") as string)?.trim() || null;
    const beamNo = (formData.get("beam_no") as string)?.trim() || null;
    const wrpCont = (formData.get("wrp_cont") as string)?.trim() || null;
    const warpSizingParty = (formData.get("warp_sizing_party") as string)?.trim() || null;
    const convParty = (formData.get("conv_party") as string)?.trim() || null;

    const data = {
      itemType, itemCode, description, fyCode, openingQty, openingRate, openingAmount,
      unit, location, entryDate, doDate, status, voucherNo, purContNo, opnParty, convContNo,
      ratio, qtyWarp, qtyWeft, qtyBags, brand, remarks, grayWidth, weave, designNo,
      loomType, lvNo, grayConstruction, blend, productName,
      than, rejection, netMtr, setNo, beamSetNo, beamNo, wrpCont, warpSizingParty, convParty,
    };

    const targetTab = TAB_MAP[itemType] || "yarn";

    if (id) {
      await db.update(schema.inventoryOpening).set(data).where(eq(schema.inventoryOpening.id, parseInt(id)));
      revalidatePath("/define/inv-opening");
      redirect(`/define/inv-opening?tab=${targetTab}&id=${id}`);
    } else {
      const [inserted] = await db.insert(schema.inventoryOpening).values(data).returning({ id: schema.inventoryOpening.id });
      revalidatePath("/define/inv-opening");
      redirect(`/define/inv-opening?tab=${targetTab}&id=${inserted.id}`);
    }
  }

  async function deleteEntry(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string);
    if (!id) return;
    await db.delete(schema.inventoryOpening).where(eq(schema.inventoryOpening.id, id));
    revalidatePath("/define/inv-opening");
    redirect("/define/inv-opening?tab=" + (formData.get("tab") as string || "yarn"));
  }

  const formatNum = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  const tabs = [
    { key: "yarn", label: "Yarn Opening", count: yarnRows.length },
    { key: "grey", label: "Grey Lots Open Stock", count: greyRows.length },
    { key: "beam", label: "Loaded Beam Opening", count: beamRows.length },
  ];

  const currentRows = tab === "yarn" ? yarnRows : tab === "grey" ? greyRows : beamRows;
  const itemTypeValue = tab === "yarn" ? "YARN" : tab === "grey" ? "GREY" : "BEAM";

  return (
    <Shell active="inv-opening">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <h1 className="page-title">Inventory Opening</h1>
          {tab === "yarn" && (
            <ExcelExportButton
              rows={yarnRows}
              columns={[
                { key: "entryDate", label: "Date" },
                { key: "itemCode", label: "DO/Bilty" },
                { key: "voucherNo", label: "Voucher No" },
                { key: "description", label: "Count Code" },
                { key: "location", label: "Location" },
                { key: "brand", label: "Brand" },
                { key: "ratio", label: "Ratio" },
                { key: "qtyWarp", label: "Warp Qty" },
                { key: "qtyWeft", label: "Weft Qty" },
                { key: "qtyBags", label: "Bags" },
                { key: "openingQty", label: "Qty Lbs" },
                { key: "openingRate", label: "Rate" },
                { key: "openingAmount", label: "Amount" },
                { key: "unit", label: "Unit" },
                { key: "remarks", label: "Remarks" },
                { key: "status", label: "Status" },
              ]}
              filename="inv-opening-yarn"
              sheetName="YarnOpening"
            />
          )}
          {tab === "grey" && (
            <ExcelExportButton
              rows={greyRows}
              columns={[
                { key: "entryDate", label: "Date" },
                { key: "voucherNo", label: "V.No" },
                { key: "itemCode", label: "Lot No" },
                { key: "description", label: "Product Name" },
                { key: "location", label: "Location" },
                { key: "grayConstruction", label: "Gray Construction" },
                { key: "blend", label: "Blend" },
                { key: "grayWidth", label: "Width" },
                { key: "weave", label: "Weave" },
                { key: "designNo", label: "Design No" },
                { key: "loomType", label: "Loom Type" },
                { key: "openingQty", label: "Qty" },
                { key: "openingRate", label: "Rate" },
                { key: "openingAmount", label: "Amount" },
                { key: "unit", label: "Unit" },
                { key: "status", label: "Status" },
              ]}
              filename="inv-opening-grey"
              sheetName="GreyOpening"
            />
          )}
          {tab === "beam" && (
            <ExcelExportButton
              rows={beamRows}
              columns={[
                { key: "entryDate", label: "Date" },
                { key: "itemCode", label: "V.No" },
                { key: "lvNo", label: "LV.No" },
                { key: "description", label: "Description" },
                { key: "openingQty", label: "B.Length" },
                { key: "openingRate", label: "Rate" },
                { key: "openingAmount", label: "Amount" },
                { key: "location", label: "Location" },
                { key: "unit", label: "Unit" },
                { key: "status", label: "Status" },
              ]}
              filename="inv-opening-beam"
              sheetName="BeamOpening"
            />
          )}
        </div>

        <div className="flex gap-0 border-b-2 border-black mb-6">
          {tabs.map((t) => (
            <a
              key={t.key}
              href={`/define/inv-opening?tab=${t.key}`}
              className="no-underline px-4 py-2 text-[12px] uppercase tracking-[0.08em] font-semibold"
              style={{
                background: tab === t.key ? "black" : "transparent",
                color: tab === t.key ? "white" : "black",
              }}
            >
              {t.label} ({t.count})
            </a>
          ))}
        </div>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New Entry" : formItem ? "Edit Entry" : tabs.find((t) => t.key === tab)?.label}
            </div>
            <div className="flex gap-2">
              <a href={`/define/inv-opening?tab=${tab}&adding=1`} className="btn btn-outline btn-sm">New</a>
              {formItem && (
                <form action={deleteEntry} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <input type="hidden" name="tab" value={tab} />
                  <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                </form>
              )}
            </div>
          </div>

          <form action={saveEntry}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}
            <input type="hidden" name="item_type" value={formItem?.itemType ?? itemTypeValue} />

            {tab === "yarn" && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">Date</label>
                    <input name="entry_date" type="date" className="input-box mono" defaultValue={formItem?.entryDate ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">DO Date</label>
                    <input name="do_date" type="date" className="input-box mono" defaultValue={formItem?.doDate ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">DO/Bilty No</label>
                    <input name="item_code" className="input-box mono" defaultValue={formItem?.itemCode ?? ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Voucher No</label>
                    <input name="voucher_no" className="input-box mono bg-gray-100" defaultValue={nextVoucherNo} readOnly />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">FY Code</label>
                    <input name="fy_code" className="input-box mono" defaultValue={formItem?.fyCode ?? ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select name="status" className="input-box" defaultValue={formItem?.status ?? "A"}>
                      <option value="A">Active</option>
                      <option value="R">Reject</option>
                      <option value="C">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Pur Cont.No</label>
                    <input name="pur_cont_no" className="input-box mono" defaultValue={formItem?.purContNo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Opn. Party</label>
                    <input name="opn_party" className="input-box mono" defaultValue={formItem?.opnParty ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">Conv.Cont No</label>
                    <input name="conv_cont_no" className="input-box mono" defaultValue={formItem?.convContNo ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Count Code / Description</label>
                    <input name="description" className="input-box" defaultValue={formItem?.description ?? ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Location</label>
                    <select name="location" className="input-box" defaultValue={formItem?.location ?? ""}>
                      <option value="">--</option>
                      {locations.filter((l) => l.type === "YARN").map((l) => (
                        <option key={l.id} value={l.description}>{l.description}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">Brand</label>
                    <select name="brand" className="input-box" defaultValue={formItem?.brand ?? ""}>
                      <option value="">--</option>
                      {yarnBrands.map((b) => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Ratio</label>
                    <input name="ratio" className="input-box mono" defaultValue={formItem?.ratio ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-x-3">
                  <div>
                    <label className="label block mb-1">Warp</label>
                    <input name="qty_warp" type="number" step="any" className="input-box mono" defaultValue={formItem?.qtyWarp ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Weft</label>
                    <input name="qty_weft" type="number" step="any" className="input-box mono" defaultValue={formItem?.qtyWeft ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Bags</label>
                    <input name="qty_bags" type="number" step="any" className="input-box mono" defaultValue={formItem?.qtyBags ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Qty Lbs</label>
                    <input name="qty" type="number" step="any" className="input-box mono" defaultValue={formItem?.openingQty ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Rate Per Lbs</label>
                    <input name="rate" type="number" step="any" className="input-box mono" defaultValue={formItem?.openingRate ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Pur. Amount</label>
                    <input name="amount" type="number" step="any" className="input-box mono" defaultValue={formItem?.openingAmount ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div className="col-span-3">
                    <label className="label block mb-1">Remarks</label>
                    <input name="remarks" className="input-box" defaultValue={formItem?.remarks ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Unit</label>
                    <input name="unit" className="input-box" defaultValue={formItem?.unit ?? "LBS"} />
                  </div>
                </div>
              </div>
            )}

            {tab === "grey" && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">Date</label>
                    <input name="entry_date" type="date" className="input-box mono" defaultValue={formItem?.entryDate ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">V.No</label>
                    <input name="voucher_no" className="input-box mono" defaultValue={formItem?.voucherNo ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Stock Location</label>
                    <select name="location" className="input-box" defaultValue={formItem?.location ?? ""}>
                      <option value="">--</option>
                      {locations.filter((l) => l.type === "GREY").map((l) => (
                        <option key={l.id} value={l.description}>{l.description}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div className="col-span-2">
                    <label className="label block mb-1">Product Name</label>
                    <input name="description" className="input-box" defaultValue={formItem?.description ?? ""} required />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Gray Construction</label>
                    <select name="gray_construction" className="input-box" defaultValue={formItem?.grayConstruction ?? ""}>
                      <option value="">--</option>
                      {greyConstructions.map((g) => (
                        <option key={g.id} value={g.code}>{g.code} - {g.description}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">Gray Width</label>
                    <input name="gray_width" type="number" step="any" className="input-box mono" defaultValue={formItem?.grayWidth ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Blend</label>
                    <select name="blend" className="input-box" defaultValue={formItem?.blend ?? ""}>
                      <option value="">--</option>
                      {yarnBlends.map((b) => (
                        <option key={b.id} value={b.description}>{b.description}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Weave</label>
                    <input name="weave" className="input-box" defaultValue={formItem?.weave ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Design No</label>
                    <input name="design_no" className="input-box mono" defaultValue={formItem?.designNo ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">Loom Type</label>
                    <select name="loom_type" className="input-box" defaultValue={formItem?.loomType ?? ""}>
                      <option value="">--</option>
                      <option value="RAPIER">RAPIER</option>
                      <option value="AIR_JET">AIR JET</option>
                      <option value="WATER_JET">WATER JET</option>
                      <option value="PROJECTILE">PROJECTILE</option>
                      <option value="SHUTTLE">SHUTTLE</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Remarks</label>
                    <input name="remarks" className="input-box" defaultValue={formItem?.remarks ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-x-3">
                  <div>
                    <label className="label block mb-1">Lot No / Item Code</label>
                    <input name="item_code" className="input-box mono" defaultValue={formItem?.itemCode ?? ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">FY Code</label>
                    <input name="fy_code" className="input-box mono" defaultValue={formItem?.fyCode ?? ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Qty</label>
                    <input name="qty" type="number" step="any" className="input-box mono" defaultValue={formItem?.openingQty ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Rate</label>
                    <input name="rate" type="number" step="any" className="input-box mono" defaultValue={formItem?.openingRate ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Amount</label>
                    <input name="amount" type="number" step="any" className="input-box mono" defaultValue={formItem?.openingAmount ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Unit</label>
                    <input name="unit" className="input-box" defaultValue={formItem?.unit ?? "MTR"} />
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select name="status" className="input-box" defaultValue={formItem?.status ?? "A"}>
                      <option value="A">Active</option>
                      <option value="R">Reject</option>
                      <option value="C">Closed</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">Than</label>
                    <input name="than" type="number" step="any" className="input-box mono" defaultValue={formItem?.than ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Rejection</label>
                    <input name="rejection" type="number" step="any" className="input-box mono" defaultValue={formItem?.rejection ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Net Mtr.</label>
                    <input name="net_mtr" type="number" step="any" className="input-box mono" defaultValue={formItem?.netMtr ?? ""} />
                  </div>
                </div>
              </div>
            )}

            {tab === "beam" && (
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-x-4">
                  <div>
                    <label className="label block mb-1">Date</label>
                    <input name="entry_date" type="date" className="input-box mono" defaultValue={formItem?.entryDate ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">V. No</label>
                    <input name="item_code" className="input-box mono" defaultValue={formItem?.itemCode ?? ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Voucher No</label>
                    <input name="voucher_no" className="input-box mono" defaultValue={formItem?.voucherNo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">LV.No</label>
                    <input name="lv_no" className="input-box mono" defaultValue={formItem?.lvNo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">FY Code</label>
                    <input name="fy_code" className="input-box mono" defaultValue={formItem?.fyCode ?? ""} required />
                  </div>
                </div>
                <div>
                  <label className="label block mb-1">Description</label>
                  <input name="description" className="input-box w-full" defaultValue={formItem?.description ?? ""} required />
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">B. Length</label>
                    <input name="qty" type="number" step="any" className="input-box mono" defaultValue={formItem?.openingQty ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Rate</label>
                    <input name="rate" type="number" step="any" className="input-box mono" defaultValue={formItem?.openingRate ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Amount</label>
                    <input name="amount" type="number" step="any" className="input-box mono" defaultValue={formItem?.openingAmount ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Unit</label>
                    <input name="unit" className="input-box" defaultValue={formItem?.unit ?? "MTR"} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-4">
                  <div>
                    <label className="label block mb-1">Location</label>
                    <select name="location" className="input-box" defaultValue={formItem?.location ?? ""}>
                      <option value="">--</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.description}>{l.description}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select name="status" className="input-box" defaultValue={formItem?.status ?? "A"}>
                      <option value="A">Active</option>
                      <option value="R">Reject</option>
                      <option value="C">Closed</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-4">
                  <div>
                    <label className="label block mb-1">Set #</label>
                    <input name="set_no" className="input-box mono" defaultValue={formItem?.setNo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Beam Set #</label>
                    <input name="beam_set_no" className="input-box mono" defaultValue={formItem?.beamSetNo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Beam #</label>
                    <input name="beam_no" className="input-box mono" defaultValue={formItem?.beamNo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Wrp Cont</label>
                    <input name="wrp_cont" className="input-box mono" defaultValue={formItem?.wrpCont ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Warp/Sizing Party</label>
                    <input name="warp_sizing_party" className="input-box mono" defaultValue={formItem?.warpSizingParty ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Conversion Party</label>
                    <input name="conv_party" className="input-box mono" defaultValue={formItem?.convParty ?? ""} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button type="submit" className="btn btn-sm">Save</button>
              <a href={`/define/inv-opening?tab=${tab}`} className="btn btn-outline btn-sm">Exit</a>
            </div>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {tab === "yarn" && (<>
                  <th>Date</th><th>DO/Bilty</th><th>Count Desc</th><th className="text-right">Qty Lbs</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th>Location</th>
                </>)}
                {tab === "grey" && (<>
                  <th>Date</th><th>Lot No</th><th>Product</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th>Location</th>
                </>)}
                {tab === "beam" && (<>
                  <th>Date</th><th>V. No</th><th>Description</th><th className="text-right">B. Length</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th>Location</th>
                </>)}
              </tr>
            </thead>
            <tbody>
              {currentRows.map((r) => {
                const isSel = r.id === selected?.id;
                const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                const href = `/define/inv-opening?tab=${tab}&id=${r.id}`;
                return (
                  <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>{r.entryDate ?? "-"}</a>
                    </td>
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>{r.itemCode}</a>
                    </td>
                    <td className="text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>{r.description}</a>
                    </td>
                    <td className="text-right mono">
                      <a href={href} className="no-underline block" style={linkStyle}>{formatNum(r.openingQty)}</a>
                    </td>
                    <td className="text-right mono">
                      <a href={href} className="no-underline block" style={linkStyle}>{formatNum(r.openingRate)}</a>
                    </td>
                    <td className="text-right mono font-bold">
                      <a href={href} className="no-underline block" style={linkStyle}>{formatNum(r.openingAmount)}</a>
                    </td>
                    <td className="text-[13px] text-[var(--muted)]">
                      <a href={href} className="no-underline block" style={linkStyle}>{r.location ?? "-"}</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
