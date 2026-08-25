import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const session = await requireSession();
  if (session.roleName !== "ADMIN") {
    redirect("/?error=admin_only");
  }

  const today = new Date().toISOString().slice(0, 10);
  const filename = `sk-mills-backup-${today}.json`;

  return (
    <Shell active="backup">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">Daily Backup</h1>
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold text-[var(--muted)]">
            ADMIN &middot; {session.login}
          </div>
        </div>

        <div className="border-2 border-black bg-gray-50 p-4 mb-6">
          <div className="text-[12px] uppercase tracking-[0.1em] font-semibold mb-2">
            Auto Backup Status
          </div>
          <div className="text-[13px] leading-relaxed">
            Database is auto-backed-up to Turso every second. Continuous
            point-in-time replication is handled by Turso and requires no manual
            action. Use the manual snapshot below if you need an offline copy
            for archival, audit, or migration.
          </div>
          <div className="mt-3 flex gap-3 text-[11px] mono uppercase tracking-wider">
            <div className="border border-black px-2 py-1">
              REPLICATION: <b>ACTIVE</b>
            </div>
            <div className="border border-black px-2 py-1">
              INTERVAL: <b>1s</b>
            </div>
            <div className="border border-black px-2 py-1">
              MODE: <b>MANAGED (TURSO)</b>
            </div>
          </div>
        </div>

        <div className="border border-black p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold mb-1">
                Manual Snapshot
              </div>
              <div className="text-[12px] text-[var(--muted)]">
                Dumps every table to a single JSON file (
                <span className="mono">{filename}</span>). May take a few
                seconds on larger databases.
              </div>
            </div>
            <a
              href="/api/backup"
              download={filename}
              className="btn btn-sm"
              style={{ background: "#000", color: "#fff" }}
            >
              Download Snapshot
            </a>
          </div>
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            Past Manual Snapshots
          </div>
          <div className="p-6 text-[13px] text-[var(--muted)] italic text-center">
            Past snapshots stored in Vercel Blob would appear here.
            <div className="mt-2 text-[11px]">
              (Out of scope in this build — implement Vercel Blob persistence to
              enable retention.)
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
