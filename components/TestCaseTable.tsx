"use client";

import { useMemo, useState } from "react";
import type { TestCase } from "@/lib/supabase";

const CATEGORIES: TestCase["category"][] = [
  "Functional",
  "Validation",
  "UI",
  "Negative Test",
];

const PRIORITY_STYLE: Record<TestCase["priority"], string> = {
  High: "bg-red-100 text-red-700 ring-red-200",
  Medium: "bg-amber-100 text-amber-700 ring-amber-200",
  Low: "bg-slate-100 text-slate-700 ring-slate-200",
};

const CATEGORY_STYLE: Record<TestCase["category"], string> = {
  Functional: "bg-blue-100 text-blue-700 ring-blue-200",
  Validation: "bg-violet-100 text-violet-700 ring-violet-200",
  UI: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Negative Test": "bg-rose-100 text-rose-700 ring-rose-200",
};

export type TestCaseTableProps = {
  cases: TestCase[];
  /**
   * When provided, the actual_result column becomes editable inline.
   * The parent is responsible for updating its state.
   */
  onUpdateCase?: (testId: string, patch: Partial<TestCase>) => void;
};

export default function TestCaseTable({ cases, onUpdateCase }: TestCaseTableProps) {
  const [filter, setFilter] = useState<TestCase["category"] | "All">("All");
  const editable = typeof onUpdateCase === "function";

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: cases.length };
    for (const cat of CATEGORIES) c[cat] = 0;
    for (const tc of cases) c[tc.category] = (c[tc.category] ?? 0) + 1;
    return c;
  }, [cases]);

  const filledCount = useMemo(
    () => cases.filter((c) => (c.actual_result ?? "").trim().length > 0).length,
    [cases]
  );

  const visible = filter === "All" ? cases : cases.filter((c) => c.category === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("All")}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
            filter === "All"
              ? "bg-slate-900 text-white ring-slate-900"
              : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          All ({counts.All})
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
              filter === cat
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {cat} ({counts[cat] ?? 0})
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">
          Actual Result terisi:{" "}
          <span className="font-medium text-slate-700">
            {filledCount}/{cases.length}
          </span>
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="max-h-[640px] overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Test Case</th>
                <th className="px-3 py-2">Precondition</th>
                <th className="px-3 py-2">Steps</th>
                <th className="px-3 py-2">Expected Result</th>
                <th className="px-3 py-2 min-w-[220px]">Actual Result</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((tc) => (
                <tr key={tc.test_id} className="align-top">
                  <td className="px-3 py-3 font-mono text-xs text-slate-500">{tc.test_id}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">{tc.test_case_name}</td>
                  <td className="px-3 py-3 text-slate-700">{tc.precondition || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">
                    <ol className="list-inside list-decimal space-y-0.5">
                      {tc.test_steps.map((s, i) => (
                        <li key={i}>{s.replace(/^\d+\.\s*/, "")}</li>
                      ))}
                    </ol>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{tc.expected_result}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {(() => {
                      const isAutoFilled = /^[✓✗]\s+Auto-CRUD:/.test(
                        tc.actual_result ?? ""
                      );
                      if (editable) {
                        return (
                          <div className="space-y-1">
                            {isAutoFilled && (
                              <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-indigo-600">
                                <span>🤖</span>
                                <span>Diisi otomatis dari auto-CRUD</span>
                              </div>
                            )}
                            <textarea
                              value={tc.actual_result ?? ""}
                              onChange={(e) =>
                                onUpdateCase?.(tc.test_id, {
                                  actual_result: e.target.value,
                                })
                              }
                              placeholder="Diisi setelah eksekusi..."
                              rows={Math.max(
                                2,
                                Math.min(6, (tc.actual_result ?? "").split("\n").length + 1)
                              )}
                              className={
                                isAutoFilled
                                  ? "min-w-[200px] w-full rounded border border-indigo-200 bg-indigo-50/40 px-2 py-1 text-xs text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300"
                                  : "min-w-[200px] w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                              }
                            />
                          </div>
                        );
                      }
                      // read-only mode (history detail)
                      if (tc.actual_result) {
                        return (
                          <div className="space-y-1">
                            {isAutoFilled && (
                              <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-indigo-600">
                                <span>🤖</span>
                                <span>Diisi otomatis</span>
                              </div>
                            )}
                            <span className="whitespace-pre-wrap">
                              {tc.actual_result}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <span className="text-xs italic text-slate-400">
                          (belum diisi)
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${PRIORITY_STYLE[tc.priority]}`}
                    >
                      {tc.priority}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${CATEGORY_STYLE[tc.category]}`}
                    >
                      {tc.category}
                    </span>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Tidak ada test case untuk filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
