import { requireSession, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SidebarNav } from "./sidebar-nav";

const SECTIONS = [
  {
    label: null,
    items: [{ href: "/", label: "Dashboard", key: "dash" }],
  },
  {
    label: "Define",
    items: [
      { href: "/accounts", label: "Chart of Accounts", key: "accounts" },
      { href: "/define/chart-define", label: "Chart Define", key: "chart-define" },
      { href: "/define/grey-dsp", label: "Grey Despatch Chart", key: "grey-dsp" },
      { href: "/define/cities", label: "Area-Cities", key: "cities" },
      { href: "/define/beam-status", label: "Beam Status", key: "beam-status" },
      { href: "/define/company-units", label: "Company Unit", key: "company-units" },
      { href: "/define/staff", label: "Production Staff", key: "staff" },
      { href: "/weaving/beams", label: "Beams", key: "beams" },
      { href: "/define/weavers", label: "Weavers", key: "weavers" },
      { href: "/weaving/looms", label: "Looms", key: "looms" },
      { href: "/define/party-counts", label: "Party Count", key: "party-counts" },
      { href: "/define/yarn-blends", label: "Yarn Blend", key: "yarn-blends" },
      { href: "/weaving/yarn", label: "Yarn Counts", key: "yarn" },
      { href: "/define/yarn-brands", label: "Yarn Brands", key: "yarn-brands" },
      { href: "/weaving/grey", label: "Grey Construction", key: "grey" },
      { href: "/define/locations", label: "Despatch Parties Location", key: "locations" },
      { href: "/define/do-parties", label: "DO Party Chart", key: "do-parties" },
      { href: "/define/products", label: "Products Coding", key: "products" },
      { href: "/define/yarn-fibers", label: "Yarn Fiber", key: "yarn-fibers" },
      { href: "/define/inv-opening", label: "Inventory Opening", key: "inv-opening" },
      { href: "/define/branch-opening", label: "New Branch Opening", key: "branch-opening" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/contracts", label: "Contracts", key: "contracts" },
      { href: "/inventory/yarn-receipt", label: "Yarn Receipt / Return", key: "yarn-receipt" },
      { href: "/inventory/yarn-transfer", label: "Yarn Internal Transfer", key: "yarn-transfer" },
      { href: "/inventory/beam-issue", label: "Empty Beam Issue", key: "beam-issue" },
      { href: "/inventory/beam-return", label: "Empty Beam Return", key: "beam-return" },
      { href: "/inventory/warped-beam", label: "Warped Beam Receiving", key: "warped-beam" },
      { href: "/inventory/knotting", label: "Knotting / Sarning", key: "knotting" },
      { href: "/inventory/hours-schedule", label: "Production Hours", key: "hours-schedule" },
      { href: "/weaving/production", label: "Daily Production", key: "production" },
      { href: "/inventory/grey-despatch", label: "Grey Cloth Despatch", key: "grey-despatch" },
      { href: "/inventory/paki-parchi", label: "Grey Paki Parchi", key: "paki-parchi" },
      { href: "/inventory/reports", label: "Inventory Reports", key: "inv-reports" },
    ],
  },
  {
    label: "Inventory External",
    items: [
      { href: "/contracts?type=YARN_PUR", label: "Yarn Purchase", key: "yarn-pur" },
      { href: "/contracts?type=GREY_SALE", label: "Grey Sale", key: "grey-sale" },
      { href: "/contracts?type=WARPING", label: "Warping", key: "warping" },
      { href: "/contracts?type=GREY_CONV", label: "Grey Conversion", key: "grey-conv" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/finance/cr", label: "Cash Receipt Voucher", key: "fin-cr" },
      { href: "/finance/cp", label: "Cash Payment Voucher", key: "fin-cp" },
      { href: "/finance/br", label: "Bank Receipt Voucher", key: "fin-br" },
      { href: "/finance/bp", label: "Bank Payment Voucher", key: "fin-bp" },
      { href: "/finance/jv", label: "Journal Voucher", key: "fin-jv" },
      { href: "/finance/pr", label: "Petty Cash Receipt", key: "fin-pr" },
      { href: "/finance/pc", label: "Petty Cash Payment", key: "fin-pc" },
      { href: "/vouchers", label: "All Vouchers", key: "vouchers" },
      { href: "/ledger", label: "General Ledger", key: "ledger" },
      { href: "/reports/trial-balance", label: "Trial Balance", key: "trial-balance" },
      { href: "/reports/daily-activity", label: "Daily Activity", key: "daily-activity" },
      { href: "/reports/aging", label: "Aging Analysis", key: "aging" },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/store/parts", label: "Parts Catalog", key: "parts" },
      { href: "/store/stock", label: "Stock Inquiry", key: "stock" },
      { href: "/store/demand", label: "Demand Notes", key: "demand" },
      { href: "/store/grn", label: "Goods Received", key: "grn" },
      { href: "/store/gatepass", label: "Gate Pass", key: "gatepass" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/settings/users", label: "Users & Roles", key: "users" },
      { href: "/settings/cost-centers", label: "Cost Centers", key: "cost-centers" },
      { href: "/settings/fiscal-years", label: "Fiscal Years", key: "fiscal-years" },
      { href: "/settings/locking", label: "System Locking", key: "locking" },
    ],
  },
];

export async function Shell({ children, active }: { children: React.ReactNode; active?: string }) {
  const session = await requireSession();

  async function handleLogout() {
    "use server";
    await logout();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-black text-white flex flex-col fixed h-screen overflow-y-auto scrollbar-thin">
        <div className="p-5 border-b border-white/10">
          <div className="text-lg font-bold tracking-tight">SK MILLS</div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mt-1">
            Weaving Management
          </div>
        </div>

        <SidebarNav sections={SECTIONS} active={active} />

        <div className="p-5 border-t border-white/10">
          <div className="text-[12px] font-medium">{session.fullName}</div>
          <div className="text-[9px] uppercase tracking-[0.1em] text-white/30 mt-0.5">
            {session.roleName}
          </div>
          <form action={handleLogout}>
            <button
              type="submit"
              className="mt-2 text-[10px] uppercase tracking-[0.08em] text-white/30 hover:text-white transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 ml-56">
        <div className="p-8 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
