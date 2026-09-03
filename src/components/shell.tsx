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
      { href: "/my-queue", label: "My Queue", key: "my-queue" },
      { href: "/team/workload", label: "Team Workload", key: "team-workload" },
    ],
  },
  {
    label: "Define",
    items: [
      { href: "/accounts", label: "Chart of Accounts", key: "accounts" },
      { href: "/accounts/print", label: "Chart of Accounts (Print)", key: "accounts-print" },
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
    label: "Calculator",
    items: [
      { href: "/inventory/contracts/conversion-calc", label: "Grey Conversion Calculator", key: "calc-conv" },
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
        label: "Grey Reports",
        items: [
          { href: "/reports/grey/stock-ledger", label: "Grey Stock Ledger", key: "rpt-grey-stock-ledger" },
          { href: "/reports/grey/shrinkage", label: "Grey Shrinkage", key: "rpt-grey-shrinkage" },
          { href: "/reports/grey/bill-kp-pp", label: "Grey Bill KP-PP", key: "rpt-grey-bill-kp-pp" },
          { href: "/reports/grey/conv-bill-kp-pp", label: "Grey Conversion Bill (KP/PP)", key: "rpt-grey-conv-bill-kp-pp" },
          { href: "/reports/grey/packi-parchi-bill", label: "Packi Parchi Bill/Register", key: "rpt-grey-packi-parchi-bill" },
          { href: "/reports/grey/delivery-order", label: "Grey Delivery Order", key: "rpt-grey-delivery-order" },
          { href: "/reports/grey/delivery-order-tax", label: "Grey Delivery Order (Tax)", key: "rpt-grey-delivery-order-tax" },
          { href: "/reports/grey/despatch-detail-srno", label: "Despatch Detail by Sr No", key: "rpt-grey-despatch-srno" },
        ],
      },
      {
        label: "Yarn Reports",
        items: [
          { href: "/reports/yarn/stock", label: "Yarn Stock (Count)", key: "rpt-yarn-stock" },
          { href: "/reports/yarn/stock-ledger-godown", label: "Yarn Stock Ledger by Godown", key: "rpt-yarn-stock-godown" },
          { href: "/reports/yarn/count-balance", label: "Yarn Count Balance", key: "rpt-yarn-count-balance" },
          { href: "/reports/yarn/count-avg-rate", label: "Yarn Count Avg Rate", key: "rpt-yarn-count-avg-rate" },
          { href: "/reports/yarn/pur-contract-history", label: "Purchase Contract History", key: "rpt-yarn-pur-cont-history" },
          { href: "/reports/yarn/sale-register", label: "Yarn Sale Register", key: "rpt-yarn-sale-register" },
        ],
      },
      {
        label: "Weaving Reports",
        items: [
          { href: "/reports/weaving/count-report", label: "Counts Accounts Report", key: "w-count-report" },
          { href: "/reports/weaving/counts-accounts", label: "Counts Accounts", key: "w-counts" },
          { href: "/reports/weaving/counts-accounts-design", label: "Counts Accounts by Design", key: "w-counts-design" },
          { href: "/reports/weaving/counts-accounts-summary", label: "Counts Accounts Summary", key: "w-counts-sum" },
          { href: "/reports/weaving/daily-folding", label: "Daily Folding", key: "w-daily-folding" },
          { href: "/reports/weaving/folding-fabric", label: "Folding by Fabric Quality", key: "w-folding-fabric" },
          { href: "/reports/weaving/folding-foreman", label: "Folding by Foreman", key: "w-folding-foreman" },
          { href: "/reports/weaving/sizing-warping-consumption", label: "Sizing/Warping Consumption", key: "w-szg-wrp" },
          { href: "/reports/weaving/knotting-bill", label: "Knotting Bill Register", key: "w-knotting-bill" },
          { href: "/reports/weaving/loom-rpm-avg", label: "Loom RPM Average", key: "w-loom-rpm-avg" },
          { href: "/reports/weaving/missing-audit", label: "Missing Audit / Supervisor", key: "w-missing-audit" },
          { href: "/reports/weaving/empty-beam-stock", label: "Empty Beam Stock", key: "w-empty-beam-stock" },
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
      { href: "/finance/finding", label: "Find Voucher", key: "finding" },
      { href: "/finance/eod-images", label: "EOD Images", key: "eod-images" },
      { href: "/finance/images", label: "Images", key: "images" },
      { href: "/vouchers", label: "All Vouchers", key: "vouchers" },
      { href: "/ledger", label: "General Ledger", key: "ledger" },
      { href: "/reports/trial-balance", label: "Trial Balance", key: "trial-balance" },
      { href: "/reports/daily-activity", label: "Daily Activity", key: "daily-activity" },
      { href: "/reports/aging", label: "Aging Analysis", key: "aging" },
      { href: "/reports/aging-cr", label: "Creditors Aging (Buckets)", key: "fin-aging-cr" },
      { href: "/reports/aging-db", label: "Debtors Aging (Buckets)", key: "fin-aging-db" },
      { href: "/reports/aging-db-date-wise", label: "Debtors Aging Date-wise", key: "fin-aging-db-dw" },
      { href: "/reports/cash-book", label: "Cash & Bank Book", key: "fin-cashbook" },
      { href: "/reports/cheque-status", label: "Cheque Status", key: "fin-cheque" },
      { href: "/reports/pl-accounts", label: "Profit & Loss", key: "fin-pl" },
      { href: "/reports/finance/project-costing", label: "Job / Project Costing", key: "fin-project-costing" },
      { href: "/reports/voucher-daybook", label: "Voucher Daybook", key: "fin-daybook" },
      { href: "/reports/gpv", label: "Print Voucher (GPV)", key: "fin-gpv" },
      { href: "/reports/grey-aging", label: "Grey Stock Aging", key: "grey-aging" },
      { href: "/reports/payroll", label: "Weaver Payroll", key: "payroll" },
      { href: "/reports/loom-efficiency", label: "Loom Efficiency", key: "loom-eff" },
    ],
  },
  {
    label: "Store",
    subsections: [
      {
        label: "Main",
        items: [
          { href: "/store/parts", label: "Parts Catalog", key: "parts" },
          { href: "/store/parts-profit", label: "Parts Profit Change", key: "parts-profit" },
          { href: "/store/stock", label: "Stock Inquiry", key: "stock" },
          { href: "/store/demand", label: "Demand Notes", key: "demand" },
          { href: "/store/grn", label: "Goods Received", key: "grn" },
          { href: "/store/adjustment", label: "Parts Adjustment", key: "adjustment" },
          { href: "/store/gatepass", label: "Gate Pass", key: "gatepass" },
        ],
      },
      {
        label: "Reports",
        items: [
          { href: "/reports/store/parts-issues-register", label: "Parts Issues Register", key: "s-issues" },
          { href: "/reports/store/parts-purchase-register", label: "Parts Purchase Register", key: "s-purchase" },
          { href: "/reports/store/parts-ledger", label: "Parts Ledger", key: "s-ledger" },
          { href: "/reports/store/cost-center-consumption", label: "Cost Center Consumption", key: "s-cc" },
          { href: "/reports/store/cost-center-consumption-loom", label: "Loom-wise Consumption", key: "s-cc-loom" },
          { href: "/reports/store/department-wise", label: "Department-wise", key: "s-dept" },
          { href: "/reports/store/grn-note", label: "GRN Note (Print)", key: "s-grn-note" },
          { href: "/reports/store/demand-print", label: "Demand (Print)", key: "s-dmd-print" },
        ],
      },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/settings/company-profile", label: "Company Profile", key: "company-profile" },
      { href: "/settings/posting-accounts", label: "Posting Accounts", key: "posting-accounts" },
      { href: "/settings/users", label: "Users & Roles", key: "users" },
      { href: "/settings/cost-centers", label: "Cost Centers", key: "cost-centers" },
      { href: "/settings/fiscal-years", label: "Fiscal Years", key: "fiscal-years" },
      { href: "/settings/locking", label: "System Locking", key: "locking" },
      { href: "/settings/backup", label: "Daily Backup", key: "backup" },
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
