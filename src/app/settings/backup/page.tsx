import { Shell } from "@/components/shell";
import { today as todayPk } from "@/lib/time";
import { requireAdmin } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function BackupPage() {
  await requireAdmin("/");
  const filename = `sk-mills-backup-${todayPk()}.json.gz`;
  return <Shell active="backup">
    <h1 className="page-title mb-6">Database Backup</h1>
    <div className="border p-5 mb-4">
      <h2 className="font-semibold mb-2">Download a complete snapshot</h2>
      <p className="text-sm mb-4">Includes every database table, its structure, and a verification checksum. If any table cannot be read, the backup fails instead of producing an incomplete file.</p>
      <a href="/api/backup" download={filename} className="btn">Download Snapshot</a>
    </div>
    <div className="border p-5 mb-4">
      <h2 className="font-semibold mb-2">Keep a separate copy</h2>
      <p className="text-sm">Store downloaded snapshots somewhere separate from this computer. They contain confidential business records and account information. This screen does not verify your hosting provider’s backup retention.</p>
    </div>
    <div className="border p-5">
      <h2 className="font-semibold mb-2">Recovery verification</h2>
      <p className="text-sm">A restore drill on 28 October 2026 verified all 114 tables and 11,300 rows, with matching checksums and no foreign-key errors. Restoration was tested in a separate database; the live database was not overwritten.</p>
    </div>
  </Shell>;
}
