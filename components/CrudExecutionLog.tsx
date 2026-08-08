import type { CrudExecutionLog as Log } from "@/lib/supabase";

const STATUS_STYLE: Record<Log["steps"][number]["status"], string> = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  failed: "bg-red-50 border-red-200 text-red-800",
  skipped: "bg-slate-50 border-slate-200 text-slate-600",
};

const STATUS_ICON: Record<Log["steps"][number]["status"], string> = {
  success: "✓",
  failed: "✗",
  skipped: "−",
};

const OP_LABEL: Record<Log["steps"][number]["operation"], string> = {
  create: "Create",
  read: "Read",
  update: "Update",
  delete: "Delete",
};

export default function CrudExecutionLog({ log }: { log: Log }) {
  const counts = log.steps.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Auto-CRUD Execution Log
          </h2>
          <p className="text-xs text-slate-500">
            Identifier:{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-700">
              {log.identifier ?? "(tidak ada)"}
            </code>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200">
            {counts.success ?? 0} berhasil
          </span>
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 ring-1 ring-red-200">
            {counts.failed ?? 0} gagal
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200">
            {counts.skipped ?? 0} dilewati
          </span>
        </div>
      </div>
      <ol className="divide-y divide-slate-100">
        {log.steps.map((step, idx) => (
          <li
            key={idx}
            className={`flex items-start gap-3 border-l-4 px-4 py-3 ${STATUS_STYLE[step.status]}`}
          >
            <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white font-semibold ring-1 ring-current">
              {STATUS_ICON[step.status]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                  {OP_LABEL[step.operation]}
                </span>
                <span className="text-sm font-semibold">{step.title}</span>
                <span className="text-[11px] opacity-60">
                  {(step.durationMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="mt-0.5 break-words text-xs">{step.details}</div>
              {step.screenshotPath && (
                <div className="mt-1 text-[11px] opacity-60">
                  Screenshot:{" "}
                  <code className="rounded bg-white/60 px-1 py-0.5">
                    {step.screenshotPath}
                  </code>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
