import Link from "next/link";
import { notFound } from "next/navigation";
import TestCaseTable from "@/components/TestCaseTable";
import ElementSummaryCard from "@/components/ElementSummary";
import CrudExecutionLogView from "@/components/CrudExecutionLog";
import {
  getSupabaseAdmin,
  type CrudExecutionLog,
  type TestCase,
  type ElementSummary,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HistoryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("test_runs")
    .select("id, url, page_title, created_at, raw_result, element_summary")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Gagal memuat: {error.message}
      </div>
    );
  }
  if (!data) notFound();

  const cases =
    (data.raw_result as { test_cases?: TestCase[] })?.test_cases ?? [];
  const crudExecution =
    (data.raw_result as { crud_execution?: CrudExecutionLog | null })
      ?.crud_execution ?? null;
  const language =
    (data.raw_result as { language?: "id" | "en" })?.language ?? "id";
  const mode =
    (data.raw_result as { mode?: "single" | "multi" })?.mode ?? "single";
  const additionalPageUrls =
    (data.raw_result as { additional_page_urls?: string[] })
      ?.additional_page_urls ?? [];
  const summary = (data.element_summary as ElementSummary | null) ?? null;
  const usedLogin = Boolean(
    (data.element_summary as { used_login?: boolean } | null)?.used_login
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/history"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Kembali ke history
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {data.page_title || "(tanpa judul)"}
          </h1>
          {usedLogin && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              Authenticated
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
            {language === "id" ? "🇮🇩 Bahasa Indonesia" : "🇬🇧 English"}
          </span>
          {mode === "multi" && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
              🌐 {1 + additionalPageUrls.length} halaman
            </span>
          )}
        </div>
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          {data.url}
        </a>
        <div className="text-xs text-slate-500">
          Dibuat {new Date(data.created_at).toLocaleString()}
        </div>
      </div>

      <ElementSummaryCard summary={summary} totalCases={cases.length} />
      {mode === "multi" && additionalPageUrls.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Halaman yang ikut di-crawl ({1 + additionalPageUrls.length})
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li className="flex items-center gap-2">
              <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                utama
              </span>
              <span className="truncate">{data.url}</span>
            </li>
            {additionalPageUrls.map((u, i) => (
              <li key={u} className="flex items-center gap-2 text-slate-600">
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200">
                  +{i + 1}
                </span>
                <a
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:text-slate-900"
                >
                  {u}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {crudExecution && <CrudExecutionLogView log={crudExecution} />}
      <TestCaseTable cases={cases} />
    </div>
  );
}
