"use client";

import { useState } from "react";
import type {
  CrudExecutionLog,
  ElementSummary,
  TestCase,
} from "@/lib/supabase";
import TestCaseTable from "./TestCaseTable";
import ElementSummaryCard from "./ElementSummary";
import CrudExecutionLogView from "./CrudExecutionLog";

type RunResult = {
  id: string | null;
  url: string;
  page_title: string | null;
  created_at: string;
  element_summary: ElementSummary | null;
  used_login?: boolean;
  login_url?: string | null;
  auto_crud?: boolean;
  language?: "id" | "en";
  mode?: "single" | "multi";
  pages_crawled?: number;
  additional_page_urls?: string[];
  test_cases: TestCase[];
  crud_execution?: CrudExecutionLog | null;
  trace_path?: string | null;
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; id: string }
  | { status: "error"; message: string };

type ApiResponse =
  | { run: RunResult; warning?: string }
  | { error: string; code?: string; failed_run_path?: string | null };

const STAGES_PUBLIC = [
  "Memvalidasi URL...",
  "Membuka halaman dengan Playwright...",
  "Mengekstrak elemen halaman...",
  "Meminta DeepSeek menyusun test case...",
  "Menyimpan ke Supabase...",
];

const STAGES_LOGIN = [
  "Memvalidasi URL...",
  "Membuka halaman login...",
  "Mengisi kredensial & submit...",
  "Navigasi ke halaman target...",
  "Mengekstrak elemen dashboard...",
  "Meminta DeepSeek menyusun test case...",
  "Menyimpan ke Supabase...",
];

export default function GenerateForm() {
  const [url, setUrl] = useState("");
  const [useLogin, setUseLogin] = useState(false);
  const [loginUrl, setLoginUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [usernameSelector, setUsernameSelector] = useState("");
  const [passwordSelector, setPasswordSelector] = useState("");
  const [submitSelector, setSubmitSelector] = useState("");
  const [autoCrud, setAutoCrud] = useState(false);
  const [confirmCrud, setConfirmCrud] = useState(false);
  const [language, setLanguage] = useState<"id" | "en">("id");
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [maxPages, setMaxPages] = useState(5);

  const [loading, setLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [failedRunPath, setFailedRunPath] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [translating, setTranslating] = useState(false);

  const stages = autoCrud
    ? [
        ...(useLogin ? STAGES_LOGIN.slice(0, -2) : STAGES_PUBLIC.slice(0, -2)),
        "Menjalankan auto-CRUD (Create → Read → Update → Delete)...",
        "Meminta DeepSeek menyusun test case...",
        "Menyimpan ke Supabase...",
      ]
    : useLogin
    ? STAGES_LOGIN
    : STAGES_PUBLIC;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFailedRunPath(null);
    setWarning(null);
    setResult(null);
    setSaveState({ status: "idle" });
    setLoading(true);
    setStageIdx(0);

    const stageTimer = setInterval(() => {
      setStageIdx((i) => Math.min(i + 1, stages.length - 1));
    }, 3500);

    try {
      const payload: Record<string, unknown> = { url, language, mode };
      if (mode === "multi") payload.maxPages = maxPages;
      if (useLogin) {
        payload.login = {
          loginUrl,
          username,
          password,
          usernameSelector: usernameSelector || undefined,
          passwordSelector: passwordSelector || undefined,
          submitSelector: submitSelector || undefined,
        };
      }
      if (autoCrud) payload.autoCrud = true;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ApiResponse;

      if (!res.ok || "error" in data) {
        const msg =
          "error" in data ? data.error : `Request gagal (${res.status}).`;
        setError(msg);
        if ("error" in data && data.failed_run_path) {
          setFailedRunPath(data.failed_run_path);
        }
        return;
      }

      if ("warning" in data && data.warning) setWarning(data.warning);
      setResult(data.run);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Gagal memproses: ${message}`);
    } finally {
      clearInterval(stageTimer);
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!result) return;
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: result.url,
          pageTitle: result.page_title,
          cases: result.test_cases,
        }),
      });
      if (!res.ok) {
        setError("Export Excel gagal.");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `testcases-${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setExporting(false);
    }
  }

  async function handleSave() {
    if (!result || saveState.status === "saving" || saveState.status === "saved") return;
    setSaveState({ status: "saving" });
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: result.url,
          page_title: result.page_title,
          element_summary: result.element_summary,
          used_login: result.used_login ?? false,
          login_url: result.login_url ?? null,
          auto_crud: result.auto_crud ?? false,
          language: result.language ?? "id",
          mode: result.mode ?? "single",
          additional_page_urls: result.additional_page_urls ?? [],
          test_cases: result.test_cases,
          crud_execution: result.crud_execution ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveState({
          status: "error",
          message: (data as { error?: string }).error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const id = (data as { id?: string }).id;
      if (!id) {
        setSaveState({ status: "error", message: "Server tidak mengembalikan id." });
        return;
      }
      setSaveState({ status: "saved", id });
      // Reflect saved id on the result so subsequent renders know.
      setResult((r) => (r ? { ...r, id } : r));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setSaveState({ status: "error", message: msg });
    }
  }

  async function handleTranslate(target: "id" | "en") {
    if (!result || translating) return;
    setTranslating(true);
    setError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cases: result.test_cases, target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
        setError(`Translate gagal: ${msg}`);
        return;
      }
      const cases = (data as { test_cases?: TestCase[] }).test_cases;
      if (!Array.isArray(cases)) {
        setError("Translate gagal: response tidak valid.");
        return;
      }
      setResult((r) => (r ? { ...r, test_cases: cases, language: target } : r));
      // Translating after Save makes the saved version stale — reset.
      if (saveState.status === "saved") setSaveState({ status: "idle" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Translate gagal: ${msg}`);
    } finally {
      setTranslating(false);
    }
  }

  function handleUpdateCase(testId: string, patch: Partial<TestCase>) {
    setResult((r) =>
      r
        ? {
            ...r,
            test_cases: r.test_cases.map((c) =>
              c.test_id === testId ? { ...c, ...patch } : c
            ),
          }
        : r
    );
    // Editing makes the saved version stale — reset save indicator so
    // the user knows they should save again.
    if (saveState.status === "saved") setSaveState({ status: "idle" });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Generate test cases dari URL
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Masukkan URL publik atau aktifkan login untuk men-test halaman dashboard di balik autentikasi.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              URL halaman target {useLogin && <span className="text-slate-500">(dashboard / halaman setelah login)</span>}
            </label>
            <input
              type="url"
              required
              placeholder={useLogin ? "https://app.example.com/dashboard" : "https://example.com/login"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-50"
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <input
              id="use-login"
              type="checkbox"
              checked={useLogin}
              onChange={(e) => setUseLogin(e.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <label htmlFor="use-login" className="text-sm font-medium text-slate-800">
              Login dulu sebelum crawl
            </label>
            <span className="ml-auto text-xs text-slate-500">
              Kredensial tidak disimpan
            </span>
          </div>

          {useLogin && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  URL halaman login
                </label>
                <input
                  type="url"
                  required={useLogin}
                  placeholder="https://app.example.com/login"
                  value={loginUrl}
                  onChange={(e) => setLoginUrl(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-50"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Username / Email
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    required={useLogin}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required={useLogin}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                {showAdvanced ? "− Sembunyikan" : "+ Selector kustom (opsional)"}
              </button>

              {showAdvanced && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Isi hanya jika auto-detect form login gagal. Pakai CSS selector standar
                    (mis. <code>#email</code>, <code>input[name=&quot;email&quot;]</code>).
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      placeholder="Username selector"
                      value={usernameSelector}
                      onChange={(e) => setUsernameSelector(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-50"
                    />
                    <input
                      type="text"
                      placeholder="Password selector"
                      value={passwordSelector}
                      onChange={(e) => setPasswordSelector(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-50"
                    />
                    <input
                      type="text"
                      placeholder="Submit button selector"
                      value={submitSelector}
                      onChange={(e) => setSubmitSelector(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-50"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>⚠️</span>
                <span>
                  Hanya gunakan akun test/staging milik kamu sendiri. Kredensial dikirim ke server kamu sekali untuk session Playwright dan tidak disimpan ke database.
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-slate-200 bg-white">
            <label className="flex cursor-pointer items-start gap-2 px-3 py-2.5">
              <input
                type="checkbox"
                checked={autoCrud}
                onChange={(e) => {
                  setAutoCrud(e.target.checked);
                  if (!e.target.checked) setConfirmCrud(false);
                }}
                disabled={loading}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-800">
                  Auto-execute CRUD (eksperimental)
                </div>
                <div className="text-xs text-slate-500">
                  Playwright otomatis menjalankan Create → Read → Update → Delete dengan data dummy untuk verifikasi flow.
                </div>
              </div>
            </label>

            {autoCrud && (
              <div className="space-y-2 border-t border-slate-200 bg-rose-50/50 px-3 py-3">
                <div className="flex items-start gap-2 text-xs text-rose-800">
                  <span>🚨</span>
                  <span>
                    <strong>Akan membuat dan menghapus data nyata</strong> di target site. Hanya gunakan di environment <strong>staging/test</strong> milik kamu sendiri. Auto-CRUD mencoba menghapus row yang ia buat sebagai cleanup, tapi kalau Delete gagal, sisa data tetap ada.
                  </span>
                </div>
                <label className="flex items-center gap-2 text-xs text-rose-900">
                  <input
                    type="checkbox"
                    required={autoCrud}
                    checked={confirmCrud}
                    onChange={(e) => setConfirmCrud(e.target.checked)}
                    disabled={loading}
                    className="h-3.5 w-3.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Saya paham, ini staging milik saya.</span>
                </label>
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                  <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">
                    💡 <strong>Watch live</strong>: set <code className="rounded bg-slate-100 px-1">CRAWLER_HEADLESS=false</code> di <code className="rounded bg-slate-100 px-1">.env.local</code>
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">
                    🐢 <strong>Slow motion</strong>: set <code className="rounded bg-slate-100 px-1">CRAWLER_SLOWMO_MS=400</code>
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">
                    🔍 <strong>Trace</strong>: set <code className="rounded bg-slate-100 px-1">CRAWLER_TRACE=true</code>
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">
                Cakupan crawl
              </span>
              <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  disabled={loading}
                  className={
                    mode === "single"
                      ? "rounded bg-white px-3 py-1 text-slate-900 shadow-sm"
                      : "rounded px-3 py-1 text-slate-500 hover:text-slate-700"
                  }
                >
                  Halaman ini saja
                </button>
                <button
                  type="button"
                  onClick={() => setMode("multi")}
                  disabled={loading}
                  className={
                    mode === "multi"
                      ? "rounded bg-white px-3 py-1 text-slate-900 shadow-sm"
                      : "rounded px-3 py-1 text-slate-500 hover:text-slate-700"
                  }
                >
                  Multi halaman
                </button>
              </div>
            </div>
            {mode === "multi" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-600" htmlFor="max-pages">
                    Maksimal halaman:
                  </label>
                  <input
                    id="max-pages"
                    type="number"
                    min={2}
                    max={10}
                    value={maxPages}
                    onChange={(e) =>
                      setMaxPages(
                        Math.min(10, Math.max(2, Number(e.target.value) || 5))
                      )
                    }
                    disabled={loading}
                    className="w-16 rounded border border-slate-300 px-2 py-1 text-xs focus:border-slate-900 focus:ring-1 focus:ring-slate-900/20 disabled:bg-slate-50"
                  />
                  <span className="text-xs text-slate-500">(2-10)</span>
                </div>
                <p className="text-xs text-slate-500">
                  Crawler ikuti link <code className="rounded bg-slate-100 px-1">same-origin</code> dari URL utama. Login (kalau aktif) dipakai sekali untuk semua halaman. Auto-CRUD tetap hanya jalan di URL utama.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <span className="text-sm font-medium text-slate-700">Bahasa output:</span>
            <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setLanguage("id")}
                disabled={loading}
                className={
                  language === "id"
                    ? "rounded bg-white px-3 py-1 text-slate-900 shadow-sm"
                    : "rounded px-3 py-1 text-slate-500 hover:text-slate-700"
                }
              >
                🇮🇩 Bahasa Indonesia
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                disabled={loading}
                className={
                  language === "en"
                    ? "rounded bg-white px-3 py-1 text-slate-900 shadow-sm"
                    : "rounded px-3 py-1 text-slate-500 hover:text-slate-700"
                }
              >
                🇬🇧 English
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || (autoCrud && !confirmCrud)}
            className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Generating..." : "Generate Test Cases"}
          </button>
        </form>

        {loading && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-900" />
              {stages[stageIdx]}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {autoCrud
                ? "Proses dengan auto-CRUD biasanya 30-90 detik."
                : mode === "multi"
                ? `Proses multi-halaman (${maxPages} halaman) biasanya 30-60 detik.`
                : useLogin
                ? "Proses dengan login biasanya 15-30 detik."
                : "Proses ini biasanya 10-20 detik."}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="font-medium">Tidak bisa generate test case</div>
            <div className="mt-0.5">{error}</div>
            {failedRunPath && (
              <div className="mt-2 border-t border-red-200 pt-2 text-xs">
                <div className="font-medium">Detail tersimpan di:</div>
                <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-[11px] text-red-800 ring-1 ring-red-200">
                  {failedRunPath}
                </code>
                <div className="mt-1 text-[11px] opacity-80">
                  Folder berisi <code>info.json</code>, <code>error.log</code>, dan{" "}
                  <code>screenshot.png</code> / <code>trace.zip</code> bila tersedia.
                </div>
              </div>
            )}
          </div>
        )}

        {warning && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warning}
          </div>
        )}
      </section>

      {result && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                Hasil untuk
                {result.used_login && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                    Authenticated
                  </span>
                )}
                {result.language && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">
                    {result.language === "id" ? "🇮🇩 Bahasa Indonesia" : "🇬🇧 English"}
                  </span>
                )}
                {result.mode === "multi" && (
                  <span
                    className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200"
                    title={result.additional_page_urls?.join("\n") ?? ""}
                  >
                    🌐 {result.pages_crawled ?? 1} halaman
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-base font-semibold text-slate-900">
                {result.page_title || "(tanpa judul)"}
              </div>
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                {result.url}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  handleTranslate(result.language === "en" ? "id" : "en")
                }
                disabled={translating}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                title="Convert all test cases to the other language"
              >
                {translating
                  ? "Translating..."
                  : result.language === "en"
                  ? "🇮🇩 ke Bahasa Indonesia"
                  : "🇬🇧 to English"}
              </button>
              <button
                onClick={handleSave}
                disabled={
                  saveState.status === "saving" || saveState.status === "saved"
                }
                className={
                  saveState.status === "saved"
                    ? "inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm"
                    : "inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                }
                title={
                  saveState.status === "saved"
                    ? "Sudah tersimpan ke history"
                    : "Simpan hasil ke history (Supabase)"
                }
              >
                {saveState.status === "saving" && "Menyimpan..."}
                {saveState.status === "saved" && (
                  <>
                    <span aria-hidden>✓</span>
                    Tersimpan
                  </>
                )}
                {(saveState.status === "idle" || saveState.status === "error") &&
                  "Save to History"}
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {exporting ? "Exporting..." : "Export to Excel"}
              </button>
            </div>
          </div>

          <ElementSummaryCard
            summary={result.element_summary}
            totalCases={result.test_cases.length}
          />
          {result.mode === "multi" &&
            result.additional_page_urls &&
            result.additional_page_urls.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Halaman yang ikut di-crawl ({result.pages_crawled})
                </div>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      utama
                    </span>
                    <span className="truncate">{result.url}</span>
                  </li>
                  {result.additional_page_urls.map((u, i) => (
                    <li
                      key={u}
                      className="flex items-center gap-2 text-slate-600"
                    >
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
          {saveState.status === "error" && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="font-medium">Save gagal</div>
              <div className="mt-0.5">{saveState.message}</div>
            </div>
          )}
          {saveState.status === "saved" && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Hasil berhasil disimpan.{" "}
              <a
                href={`/history/${saveState.id}`}
                className="font-medium underline hover:no-underline"
              >
                Lihat di history →
              </a>
            </div>
          )}
          {result.trace_path && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
              <div className="font-medium">🔍 Playwright trace tersimpan</div>
              <div className="mt-0.5 text-xs">
                Replay step-by-step di Trace Viewer:
              </div>
              <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-[11px] text-indigo-800 ring-1 ring-indigo-200">
                npx playwright show-trace {result.trace_path}
              </code>
            </div>
          )}
          {result.crud_execution && (
            <CrudExecutionLogView log={result.crud_execution} />
          )}
          <TestCaseTable cases={result.test_cases} onUpdateCase={handleUpdateCase} />
        </section>
      )}
    </div>
  );
}
