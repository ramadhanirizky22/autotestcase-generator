import type { ElementSummary as Summary } from "@/lib/supabase";

const CRUD_LABELS: Array<{ key: keyof NonNullable<Summary["crud"]>; label: string }> = [
  { key: "create", label: "Create" },
  { key: "view", label: "View" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
  { key: "search", label: "Search" },
  { key: "filter", label: "Filter" },
  { key: "pagination", label: "Pagination" },
  { key: "modal", label: "Modal" },
  { key: "export", label: "Export" },
];

export default function ElementSummary({
  summary,
  totalCases,
}: {
  summary: Summary | null;
  totalCases: number;
}) {
  const items: { label: string; value: number | string }[] = [
    { label: "Test Cases", value: totalCases },
    { label: "Forms", value: summary?.forms ?? 0 },
    { label: "Inputs", value: summary?.inputs ?? 0 },
    { label: "Buttons", value: summary?.buttons ?? 0 },
    { label: "Links", value: summary?.links ?? 0 },
    { label: "Tables", value: summary?.tables ?? 0 },
  ];

  const crud = summary?.crud;
  const detected = crud
    ? CRUD_LABELS.filter(({ key }) => crud[key])
    : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {it.label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {it.value}
            </div>
          </div>
        ))}
      </div>

      {detected.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            CRUD capability terdeteksi
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {detected.map(({ key, label }) => (
              <span
                key={key}
                className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
