import { requireSession, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ShellLayout } from "./shell-layout";

const SECTIONS = [
  {
    label: null,
    items: [
      { href: "/", label: "Dashboard", key: "dash" },
      { href: "/quick-contract", label: "Quick Contract", key: "quick-contract" },
      { href: "/owner/dashboard", label: "Executive Overview", key: "owner-dash" },
      { href: "/production/board", label: "Live Production Board", key: "prod-board" },
      { href: "/tickets", label: "Tickets", key: "tickets" },
      { href: "/my-tasks", label: "My Tasks", key: "my-tasks" },
      { href: "/team/workload", label: "Team Workload", key: "team-workload" },
    ],
  },
  {
    label: "Define",
    items: [
      { href: "/accounts", label: "Chart of Accounts", key: "accounts" },
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
      { href: "/define/yarn-counts", label: "Yarn Count", key: "yarn-counts" },
      { href: "/weaving/yarn", label: "Yarn Counts List", key: "yarn" },
      { href: "/define/yarn-brands", label: "Yarn Brands", key: "yarn-brands" },
      { href: "/define/grey-construction", label: "Grey Construction", key: "grey-construction" },
      { href: "/weaving/grey", label: "Grey Constructions List", key: "grey" },
      { href: "/define/locations", label: "Grey Despatch Parties Location", key: "locations-grey" },
      { href: "/define/yarn-locations", label: "Yarn Parties Location", key: "locations-yarn" },
      { href: "/define/do-parties", label: "DO Party Chart", key: "do-parties" },
      { href: "/define/products", label: "Products Coding", key: "products" },
      { href: "/define/yarn-fibers", label: "Yarn Fiber", key: "yarn-fibers" },
      { href: "/define/inv-opening", label: "Inventory Opening", key: "inv-opening" },
      { href: "/define/branch-opening", label: "New Branch Opening", key: "branch-opening" },
      { href: "/define/chart-define", label: "Chart Define", key: "chart-define" },
    ],
  },
  {
    label: "Inventory",
    subsections: [
      {
        label: "Contracts",
        items: [
          { href: "/inventory/contracts/yarn-purchase", label: "Yarn Purchase Contract", key: "int-c-ypc" },
          { href: "/inventory/contracts/beam-ext-ws", label: "Beam Contract External Warping/Sizing", key: "int-c-bews" },
          { href: "/inventory/contracts/grey-conversion", label: "Grey Conversion Contract", key: "int-c-gcc" },
          { href: "/inventory/contracts/knotting", label: "Knotting/Sarning/Maroori Contract", key: "int-c-knt" },
          { href: "/inventory/contracts/conversion-calc", label: "Grey Conversion Calculator", key: "int-c-calc" },
        ],
      },
      {
        label: "Main",
        items: [
          { href: "/inventory/yarn-receipt", label: "Yarn Receipt / Return", key: "yarn-receipt" },
          { href: "/inventory/yarn-transfer", label: "Yarn Internal Transfer", key: "yarn-transfer" },
          { href: "/inventory/beam-return", label: "Empty Beam Return", key: "beam-return" },
          { href: "/inventory/warped-beam", label: "Warped Beam Receiving", key: "warped-beam" },
          { href: "/inventory/knotting", label: "Knotting / Sarning / Maroori", key: "knotting" },
          { href: "/inventory/hours-schedule", label: "Production Hours Schedual", key: "hours-schedule" },
          { href: "/inventory/daily-production", label: "Daily Production Entries", key: "production" },
          { href: "/inventory/grey-despatch", label: "Grey Cloth Despatch", key: "grey-despatch" },
          { href: "/inventory/grey-despatch-dami", label: "Grey Cloth Despatch Dami", key: "grey-despatch-dami" },
          { href: "/inventory/paki-parchi", label: "Grey Paki Parchi", key: "paki-parchi" },
        ],
      },
      {
        label: "Reports",
        items: [
          { href: "/inventory/reports", label: "Inventory Reports", key: "inv-reports" },
        ],
      },
    ],
  },
  {
    label: "Inventory External",
    subsections: [
      {
        label: "Contracts",
        items: [
          { href: "/external/contracts/grey-conversion", label: "Grey Conversion Contract", key: "ext-gcc" },
          { href: "/external/contracts/yarn-purchase", label: "Yarn Purchase Contract", key: "ext-ypc" },
          { href: "/external/contracts/yarn-sales", label: "Yarn Sales Contract", key: "ext-ysc" },
          { href: "/external/contracts/grey-purchase", label: "Grey Purchase Contract", key: "ext-gpc" },
          { href: "/external/contracts/grey-sales", label: "Grey Sales Contract", key: "ext-gsc" },
        ],
      },
      {
        label: "Yarn",
        items: [
          { href: "/external/yarn/purchase", label: "Yarn Purchase", key: "ext-yp-vch" },
          { href: "/external/yarn/sale", label: "Yarn Sale", key: "ext-ys-vch" },
        ],
      },
      {
        label: "Grey",
        items: [
          { href: "/external/grey/godown-stock", label: "Grey Purchase In Stock", key: "ext-godown" },
          { href: "/external/grey/transfer", label: "Grey Transfer", key: "ext-gt" },
          { href: "/external/grey/kachi-parchi", label: "Kachi Parchi", key: "ext-kp" },
          { href: "/external/grey/packi-parchi", label: "Packi Parchi", key: "ext-pp" },
        ],
      },
      {
        label: "Reports",
        items: [
          { href: "/external/reports/kora-pending", label: "Kora Pending Lots", key: "ext-r-kora" },
          { href: "/external/reports/cloth-register", label: "Cloth Purchase Sale Register", key: "ext-r-cloth" },
          { href: "/external/reports/grey-register", label: "Grey Register", key: "ext-r-greyreg" },
          { href: "/external/reports/grey-stock", label: "Grey Stock", key: "ext-r-greystock" },
          { href: "/external/reports/yarn-register", label: "Yarn Register", key: "ext-r-yarnreg" },
          { href: "/external/reports/yarn-stock", label: "Yarn Stock", key: "ext-r-yarnstock" },
          { href: "/external/reports/weaving-counts", label: "Weaving Counts Accounts", key: "ext-r-weaving" },
        ],
      },
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
      { href: "/reports/grey-aging", label: "Grey Stock Aging", key: "grey-aging" },
      { href: "/reports/payroll", label: "Weaver Payroll", key: "payroll" },
      { href: "/reports/loom-efficiency", label: "Loom Efficiency", key: "loom-eff" },
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
      { href: "/import/excel", label: "Excel Import", key: "excel-import" },
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
    <ShellLayout
      sections={SECTIONS}
      active={active}
      sessionName={session.fullName}
      sessionRole={session.roleName}
      logoutAction={handleLogout}
    >
      {children}
    </ShellLayout>
  );
}
