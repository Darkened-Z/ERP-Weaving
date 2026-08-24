import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { and, gte, lte, isNotNull, ne, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const BASE = "/finance/images";

const SOURCES = [
  "ALL",
  "YPV",
  "YSV",
  "YPC",
  "YSC",
  "GSC",
  "GCC",
  "PP",
  "KP",
  "EOD",
] as const;

const SOURCE_LABEL: Record<string, string> = {
  YPV: "Yarn Purchase Voucher",
  YSV: "Yarn Sale Voucher",
  YPC: "Yarn Purchase Contract",
  YSC: "Yarn Sale Contract",
  GSC: "Grey Sale Contract",
  GCC: "Grey Conversion Contract",
  PP: "Packi Parchi",
  KP: "Kachi Parchi",
  EOD: "End of Day Image",
};

const SOURCE_HREF: Record<string, (id: number) => string | null> = {
  YPV: (id) => `/external/yarn/purchase?id=${id}`,
  YSV: (id) => `/external/yarn/sale?id=${id}`,
  YPC: (id) => `/external/contracts/yarn-purchase?id=${id}`,
  YSC: (id) => `/external/contracts/yarn-sales?id=${id}`,
  GSC: (id) => `/external/contracts/grey-sales?id=${id}`,
  GCC: (id) => `/external/contracts/grey-conversion?id=${id}`,
  PP: (id) => `/external/grey/packi-parchi?id=${id}`,
  KP: (id) => `/external/grey/kachi-parchi?id=${id}`,
  EOD: () => null,
};

type Row = {
  key: string;
  source: string;
  id: number;
  vno: string;
  date: string;
  party: string;
  img: string;
};

export default async function ImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; vtype?: string; party?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = (p.from ?? "").trim();
  const to = (p.to ?? "").trim();
  const sel = ((p.vtype ?? "ALL").trim().toUpperCase()) as (typeof SOURCES)[number];
  const partyQ = (p.party ?? "").trim().toLowerCase();

  const want = (t: string) => sel === "ALL" || sel === t;
  const rows: Row[] = [];

  if (want("YPV")) {
    const list = await db
      .select()
      .from(schema.extYarnPurVoucher)
      .where(
        and(
          isNotNull(schema.extYarnPurVoucher.img),
          ne(schema.extYarnPurVoucher.img, ""),
          from ? gte(schema.extYarnPurVoucher.vDate, from) : undefined,
          to ? lte(schema.extYarnPurVoucher.vDate, to) : undefined
        )
      );
    for (const r of list) {
      rows.push({ key: `YPV-${r.id}`, source: "YPV", id: r.id, vno: r.vNo, date: r.vDate, party: r.party ?? "", img: r.img! });
    }
  }
  if (want("YSV")) {
    const list = await db
      .select()
      .from(schema.extYarnSalVoucher)
      .where(
        and(
          isNotNull(schema.extYarnSalVoucher.img),
          ne(schema.extYarnSalVoucher.img, ""),
          from ? gte(schema.extYarnSalVoucher.vDate, from) : undefined,
          to ? lte(schema.extYarnSalVoucher.vDate, to) : undefined
        )
      );
    for (const r of list) {
      rows.push({ key: `YSV-${r.id}`, source: "YSV", id: r.id, vno: r.vNo, date: r.vDate, party: r.party ?? "", img: r.img! });
    }
  }
  if (want("YPC")) {
    const list = await db
      .select()
      .from(schema.extYarnPurContract)
      .where(
        and(
          isNotNull(schema.extYarnPurContract.img),
          ne(schema.extYarnPurContract.img, ""),
          from ? gte(schema.extYarnPurContract.contDate, from) : undefined,
          to ? lte(schema.extYarnPurContract.contDate, to) : undefined
        )
      );
    for (const r of list) {
      rows.push({ key: `YPC-${r.id}`, source: "YPC", id: r.id, vno: r.contNo, date: r.contDate, party: r.partyCode ?? "", img: r.img! });
    }
  }
  if (want("YSC")) {
    const list = await db
      .select()
      .from(schema.extYarnSalContract)
      .where(
        and(
          isNotNull(schema.extYarnSalContract.img),
          ne(schema.extYarnSalContract.img, ""),
          from ? gte(schema.extYarnSalContract.contDate, from) : undefined,
          to ? lte(schema.extYarnSalContract.contDate, to) : undefined
        )
      );
    for (const r of list) {
      rows.push({ key: `YSC-${r.id}`, source: "YSC", id: r.id, vno: r.contNo, date: r.contDate, party: r.partyCode ?? "", img: r.img! });
    }
  }
  if (want("GSC")) {
    const list = await db
      .select()
      .from(schema.extGreySalContract)
      .where(
        and(
          isNotNull(schema.extGreySalContract.img),
          ne(schema.extGreySalContract.img, ""),
          from ? gte(schema.extGreySalContract.contractDate, from) : undefined,
          to ? lte(schema.extGreySalContract.contractDate, to) : undefined
        )
      );
    for (const r of list) {
      rows.push({ key: `GSC-${r.id}`, source: "GSC", id: r.id, vno: r.contractNo, date: r.contractDate, party: r.party ?? "", img: r.img! });
    }
  }
  if (want("GCC")) {
    const list = await db
      .select()
      .from(schema.extGreyConvContract)
      .where(
        and(
          isNotNull(schema.extGreyConvContract.img),
          ne(schema.extGreyConvContract.img, ""),
          from ? gte(schema.extGreyConvContract.contDate, from) : undefined,
          to ? lte(schema.extGreyConvContract.contDate, to) : undefined
        )
      );
    for (const r of list) {
      rows.push({ key: `GCC-${r.id}`, source: "GCC", id: r.id, vno: r.contNo, date: r.contDate, party: r.party ?? "", img: r.img! });
    }
  }
  if (want("PP")) {
    const list = await db
      .select()
      .from(schema.extPackiParchi)
      .where(
        and(
          isNotNull(schema.extPackiParchi.imgNo),
          ne(schema.extPackiParchi.imgNo, ""),
          from ? gte(schema.extPackiParchi.vDate, from) : undefined,
          to ? lte(schema.extPackiParchi.vDate, to) : undefined
        )
      );
    for (const r of list) {
      rows.push({ key: `PP-${r.id}`, source: "PP", id: r.id, vno: r.vNo, date: r.vDate, party: r.purchaseParty ?? r.saleParty ?? "", img: r.imgNo! });
    }
  }
  if (want("KP")) {
    const list = await db
      .select()
      .from(schema.extKachiParchi)
      .where(
        and(
          isNotNull(schema.extKachiParchi.imgNo),
          ne(schema.extKachiParchi.imgNo, ""),
          from ? gte(schema.extKachiParchi.vDate, from) : undefined,
          to ? lte(schema.extKachiParchi.vDate, to) : undefined
        )
      );
    for (const r of list) {
      rows.push({ key: `KP-${r.id}`, source: "KP", id: r.id, vno: r.vNo, date: r.vDate, party: r.purchaseParty ?? r.saleParty ?? "", img: r.imgNo! });
    }
  }
  if (want("EOD")) {
    const list = await db
      .select()
      .from(schema.endOfDayImages)
      .where(
        and(
          from ? gte(schema.endOfDayImages.imgDate, from) : undefined,
          to ? lte(schema.endOfDayImages.imgDate, to) : undefined
        )
      )
      .orderBy(desc(schema.endOfDayImages.imgDate));
    for (const r of list) {
      rows.push({ key: `EOD-${r.id}`, source: "EOD", id: r.id, vno: `EOD#${r.id}`, date: r.imgDate, party: r.category ?? "", img: r.img });
    }
  }

  const filtered = partyQ
    ? rows.filter((r) => r.party.toLowerCase().includes(partyQ))
    : rows;

  filtered.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id - a.id));

  const perType = new Map<string, number>();
  for (const r of filtered) perType.set(r.source, (perType.get(r.source) ?? 0) + 1);

  return (
    <Shell active="images">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">VOUCHER&nbsp;&nbsp;IMAGES</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {filtered.length} image{filtered.length === 1 ? "" : "s"} across all voucher tables
            </p>
          </div>
        </div>

        <form method="GET" action={BASE} className="border border-black p-6 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
            <div className="lg:col-span-2">
              <label className="label block mb-1">Date From</label>
              <input name="from" type="date" className="input-box mono" defaultValue={from} />
            </div>
            <div className="lg:col-span-2">
              <label className="label block mb-1">Date To</label>
              <input name="to" type="date" className="input-box mono" defaultValue={to} />
            </div>
            <div className="lg:col-span-3">
              <label className="label block mb-1">Voucher Type</label>
              <select name="vtype" className="input-box mono" defaultValue={sel}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s === "ALL" ? "ALL" : `${s} — ${SOURCE_LABEL[s]}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-3">
              <label className="label block mb-1">Party contains</label>
              <input name="party" className="input-box mono" defaultValue={p.party ?? ""} />
            </div>
            <div className="lg:col-span-2 flex items-end gap-2">
              <button type="submit" className="btn btn-sm">Find</button>
              <a href={BASE} className="btn btn-outline btn-sm">Clear</a>
            </div>
          </div>
        </form>

        <div className="border border-black mb-6">
          <div className="px-4 py-2 border-b border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            Summary
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-0">
            {SOURCES.filter((s) => s !== "ALL").map((s) => (
              <div key={s} className="border-r border-b border-black last:border-r-0 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">{s}</div>
                <div className="mono text-[15px]">{perType.get(s) ?? 0}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((r) => {
            const href = SOURCE_HREF[r.source]?.(r.id) ?? null;
            const card = (
              <div className="border border-black p-2 h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.img} alt={r.vno} className="w-full h-40 object-cover border border-[var(--border)]" />
                <div className="mt-2 text-[11px] mono flex items-center justify-between">
                  <span className="font-semibold">{r.source}</span>
                  <span className="text-[var(--muted)]">{r.date}</span>
                </div>
                <div className="mt-1 text-[12px] mono truncate">V.No: {r.vno}</div>
                {r.party && <div className="text-[12px] truncate">{r.party}</div>}
                {href && <div className="mt-1 text-[10px] mono text-[var(--accent)] uppercase tracking-[0.08em]">Open →</div>}
              </div>
            );
            return href ? (
              <a key={r.key} href={href} className="no-underline text-inherit">
                {card}
              </a>
            ) : (
              <div key={r.key}>{card}</div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full border border-black px-4 py-8 text-center text-[13px] text-[var(--muted)]">
              No images match these filters.
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
