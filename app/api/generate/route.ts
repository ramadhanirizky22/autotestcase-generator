import { NextResponse } from "next/server";
import { CrawlError, crawlPage, type LoginConfig } from "@/lib/crawler";
import { inferActualResults } from "@/lib/crud-runner";
import { DeepSeekError, generateTestCases } from "@/lib/deepseek";
import { saveFailedRun } from "@/lib/failed-runs";
import type { ElementSummary } from "@/lib/supabase";

// Playwright + DeepSeek call → must run on the Node.js runtime,
// NOT the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow more time when auto-CRUD is enabled.
export const maxDuration = 120;

type GenerateBody = {
  url?: unknown;
  autoCrud?: unknown;
  language?: unknown;
  mode?: unknown;
  maxPages?: unknown;
  login?: {
    loginUrl?: unknown;
    username?: unknown;
    password?: unknown;
    usernameSelector?: unknown;
    passwordSelector?: unknown;
    submitSelector?: unknown;
  };
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseLogin(input: GenerateBody["login"]): LoginConfig | undefined {
  if (!input) return undefined;
  const loginUrl = asString(input.loginUrl);
  const username = asString(input.username);
  // Password may legitimately contain leading/trailing chars users want; trim only outer whitespace conservatively.
  const password =
    typeof input.password === "string" && input.password.length > 0
      ? input.password
      : undefined;
  if (!loginUrl || !username || !password) return undefined;
  return {
    loginUrl,
    username,
    password,
    usernameSelector: asString(input.usernameSelector),
    passwordSelector: asString(input.passwordSelector),
    submitSelector: asString(input.submitSelector),
  };
}

export async function POST(req: Request) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json(
      { error: "Body harus JSON dengan field 'url'." },
      { status: 400 }
    );
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "Field 'url' wajib diisi." }, { status: 400 });
  }

  const login = parseLogin(body.login);
  const autoCrud = body.autoCrud === true;
  const language: "id" | "en" = body.language === "en" ? "en" : "id";
  const mode: "single" | "multi" = body.mode === "multi" ? "multi" : "single";
  const maxPagesRaw = Number(body.maxPages);
  const maxPages =
    Number.isFinite(maxPagesRaw) && maxPagesRaw > 0
      ? Math.min(Math.max(2, Math.floor(maxPagesRaw)), 10)
      : 5;
  const startedAt = new Date();

  try {
    const crawl = await crawlPage(url, {
      ...(login ? { login } : {}),
      runCrud: autoCrud,
      mode,
      maxPages,
    });

    const summary: ElementSummary = {
      forms: crawl.forms.length,
      inputs: crawl.forms.reduce((acc, f) => acc + f.inputs.length, 0),
      buttons: crawl.buttons.length,
      links: crawl.links.length,
      headings: crawl.headings.length,
      tables: crawl.tables.length,
      crud: {
        create: crawl.crudHints.create,
        edit: crawl.crudHints.edit,
        delete: crawl.crudHints.delete,
        view: crawl.crudHints.view,
        search: crawl.crudHints.search,
        filter: crawl.crudHints.filter,
        export: crawl.crudHints.export,
        pagination: crawl.crudHints.pagination,
        modal: crawl.crudHints.modal,
      },
    };

    const cases = await generateTestCases(crawl, { language });
    // Programmatically prefill `actual_result` for test cases whose
    // names map cleanly onto an auto-CRUD step that was executed.
    const enrichedCases = crawl.crudExecution
      ? inferActualResults(cases, crawl.crudExecution)
      : cases;

    // NOTE: we no longer auto-save here — saving is explicit via the
    // "Save to History" button in the UI which calls /api/save. This
    // lets the user review the result before persisting.
    return NextResponse.json({
      run: {
        id: null,
        url: crawl.finalUrl,
        page_title: crawl.title,
        created_at: new Date().toISOString(),
        element_summary: summary,
        used_login: crawl.usedLogin ?? false,
        login_url: crawl.loginUrl ?? null,
        auto_crud: autoCrud,
        language,
        mode,
        pages_crawled: 1 + (crawl.additionalPages?.length ?? 0),
        additional_page_urls:
          crawl.additionalPages?.map((p) => p.finalUrl) ?? [],
        test_cases: enrichedCases,
        crud_execution: crawl.crudExecution ?? null,
        trace_path: crawl.tracePath ?? null,
      },
    });
  } catch (err) {
    // Persist details of the failed run to disk so the user can
    // inspect screenshot/trace/error log later. Best-effort —
    // never blocks the actual error response.
    const saved = await saveFailedRun({
      error: err,
      startedAt,
      failedAt: new Date(),
      request: {
        url,
        used_login: !!login,
        login_url: login?.loginUrl ?? null,
        auto_crud: autoCrud,
        login_selectors: login
          ? {
              username: login.usernameSelector ?? null,
              password: login.passwordSelector ?? null,
              submit: login.submitSelector ?? null,
            }
          : undefined,
      },
    });
    const failedRunPath = saved?.folder ?? null;

    if (err instanceof CrawlError) {
      const status =
        err.code === "INVALID_URL" ? 400 :
        err.code === "AUTH_REQUIRED" ? 422 :
        err.code === "LOGIN_FAILED" ? 401 :
        err.code === "LOGIN_FORM_NOT_FOUND" ? 422 :
        err.code === "TIMEOUT" ? 504 :
        err.code === "EMPTY_PAGE" ? 422 : 502;
      return NextResponse.json(
        { error: err.message, code: err.code, failed_run_path: failedRunPath },
        { status }
      );
    }
    if (err instanceof DeepSeekError) {
      const status =
        err.code === "MISSING_KEY" ? 500 :
        err.code === "PARSE_ERROR" ? 502 :
        err.code === "EMPTY" ? 502 : 502;
      return NextResponse.json(
        { error: err.message, code: err.code, failed_run_path: failedRunPath },
        { status }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message, code: "UNKNOWN", failed_run_path: failedRunPath },
      { status: 500 }
    );
  }
}
