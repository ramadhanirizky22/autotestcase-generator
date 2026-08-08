import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("test_runs")
    .select("id, url, page_title, created_at, element_summary, raw_result")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    const msg = error.message ?? String(error);
    const isNetwork =
      msg.includes("fetch failed") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("NXDOMAIN");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "Supabase";

    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold text-amber-800">⚠️ Tidak dapat terhubung ke Supabase</div>
        <p className="mt-1">
          {isNetwork
            ? `Hostname Supabase (${supabaseUrl}) tidak ditemukan (ENOTFOUND / fetch failed).`
            : `Gagal memuat history: ${msg}`}
        </p>
        <div className="mt-3 space-y-1 rounded border border-amber-200 bg-white p-3 text-xs text-slate-700">
          <div className="font-medium text-slate-900">Cara Mengatasi:</div>
          <ol className="list-inside list-decimal space-y-1">
            <li>
              Buka <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="font-medium text-amber-700 underline">Supabase Dashboard</a>.
            </li>
            <li>
              Jika status proyek <strong>PAUSED</strong> (karena inaktivitas di free tier), klik <strong>Restore project</strong>.
            </li>
            <li>
              Atau jika membuat proyek baru, perbarui <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_URL</code> & <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">SUPABASE_SERVICE_ROLE_KEY</code> di file <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">.env.local</code>.
            </li>
          </ol>
        </div>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Riwayat Generate
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Daftar 50 generate terakhir.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Belum ada riwayat. Generate pertama akan muncul di sini.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Waktu</th>
                <th className="px-4 py-2">URL</th>
                <th className="px-4 py-2">Judul</th>
                <th className="px-4 py-2 text-right">Test Cases</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const total = Array.isArray(
                  (r.raw_result as { test_cases?: unknown[] })?.test_cases
                )
                  ? (r.raw_result as { test_cases: unknown[] }).test_cases.length
                  : 0;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-700">
                      <span title={r.url}>{r.url}</span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-700">
                      {r.page_title || "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {total}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/history/${r.id}`}
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
