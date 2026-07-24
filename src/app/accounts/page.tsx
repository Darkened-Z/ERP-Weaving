import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Account = typeof schema.chartOfAccounts.$inferSelect;

function buildTree(accounts: Account[]) {
  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  const roots: (Account & { children: (Account & { children: Account[] })[] })[] = [];
  const map = new Map<string, Account & { children: (Account & { children: Account[] })[] }>();

  for (const acc of sorted) {
    const node = { ...acc, children: [] as (Account & { children: Account[] })[] };
    map.set(acc.code, node);

    const parts = acc.code.split(".");
    if (parts.length <= 1) {
      roots.push(node);
    } else {
      const parentCode = parts.slice(0, -1).join(".");
      const parent = map.get(parentCode);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }
  return roots;
}

function AccountRow({ account, depth = 0 }: { account: Account & { children: any[] }; depth?: number }) {
  const indent = depth * 24;
  const levelStyles = [
    "font-extrabold text-[15px]",
    "font-bold text-[14px]",
    "font-semibold text-[14px]",
    "font-normal text-[14px]",
    "font-normal text-[13px] text-[var(--muted)]",
  ];

  return (
    <>
      <tr className="group">
        <td className="mono text-[13px] w-40">{account.code}</td>
        <td style={{ paddingLeft: `${12 + indent}px` }}>
          <span className={levelStyles[depth] ?? levelStyles[4]}>
            {account.description}
          </span>
        </td>
        <td className="w-20 text-center">
          <span className="text-[11px] mono text-[var(--muted)]">L{account.level}</span>
        </td>
        <td className="w-20 text-right">
          <span className="mono text-[12px] text-[var(--muted)]">{account.descShort}</span>
        </td>
      </tr>
      {account.children.map((child: any) => (
        <AccountRow key={child.code} account={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ adding?: string }>;
}) {
  const params = await searchParams;
  const accounts = await db.select().from(schema.chartOfAccounts);
  const tree = buildTree(accounts);

  const headCounts = accounts.reduce(
    (acc, a) => {
      if (a.level === 1) acc.heads++;
      else if (a.level === 2) acc.groups++;
      else acc.details++;
      return acc;
    },
    { heads: 0, groups: 0, details: 0 }
  );

  async function addAccount(formData: FormData) {
    "use server";
    const code = (formData.get("code") as string).trim();
    const description = (formData.get("description") as string).trim();
    const descShort = (formData.get("descShort") as string)?.trim() || null;
    if (!code || !description) return;

    const parts = code.split(".");
    const level = parts.length;
    const codeHead = parts[0];

    await db.insert(schema.chartOfAccounts)
      .values({ code, codeHead, level, description, descShort });

    revalidatePath("/accounts");
    redirect("/accounts");
  }

  return (
    <Shell active="accounts">
      <div className="animate-in">
        <div className="flex items-baseline justify-between mb-8">
          <div>
            <h1 className="page-title">Chart of Accounts</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              5-level hierarchy &middot; {accounts.length} accounts
            </p>
          </div>
          <a href="/accounts?adding=1" className="btn btn-outline btn-sm">
            + Add Account
          </a>
        </div>

        <div className="grid grid-cols-3 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{headCounts.heads}</div>
            <div className="stat-label">Head Accounts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{headCounts.groups}</div>
            <div className="stat-label">Groups</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{headCounts.details}</div>
            <div className="stat-label">Detail Accounts</div>
          </div>
        </div>

        {params.adding && (
          <div className="border border-black p-6 mb-8 animate-in">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">New Account</div>
            <form action={addAccount} className="grid grid-cols-3 gap-4">
              <div>
                <label className="label block mb-1">Code</label>
                <input name="code" className="input-box mono" placeholder="e.g. 7.02.04" required />
              </div>
              <div>
                <label className="label block mb-1">Description</label>
                <input name="description" className="input-box" placeholder="Account name" required />
              </div>
              <div>
                <label className="label block mb-1">Short Name</label>
                <div className="flex gap-2">
                  <input name="descShort" className="input-box flex-1" placeholder="Optional" />
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/accounts" className="btn btn-outline btn-sm">Cancel</a>
                </div>
              </div>
            </form>
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th className="text-center">Level</th>
              <th className="text-right">Short</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((root) => (
              <AccountRow key={root.code} account={root} depth={0} />
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
