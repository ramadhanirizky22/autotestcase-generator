import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  type CrudExecutionLog,
  type ElementSummary,
  type TestCase,
} from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaveBody = {
  url?: unknown;
  page_title?: unknown;
  element_summary?: unknown;
  test_cases?: unknown;
  crud_execution?: unknown;
  used_login?: unknown;
  login_url?: unknown;
  auto_crud?: unknown;
  language?: unknown;
  mode?: unknown;
  additional_page_urls?: unknown;
};

export async function POST(req: Request) {
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "Body harus JSON." }, { status: 400 });
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "Field 'url' wajib diisi." }, { status: 400 });
  }
  if (!Array.isArray(body.test_cases) || body.test_cases.length === 0) {
    return NextResponse.json(
      { error: "Field 'test_cases' wajib berisi array yang tidak kosong." },
      { status: 400 }
    );
  }

  const cases = body.test_cases as TestCase[];
  const summary = (body.element_summary as ElementSummary | null) ?? null;
  const crudExecution =
    (body.crud_execution as CrudExecutionLog | null | undefined) ?? null;
  const pageTitle =
    typeof body.page_title === "string" ? body.page_title : null;
  const usedLogin = body.used_login === true;
  const loginUrl =
    typeof body.login_url === "string" && body.login_url.trim()
      ? body.login_url.trim()
      : null;
  const autoCrud = body.auto_crud === true;
  const language: "id" | "en" = body.language === "en" ? "en" : "id";
  const mode: "single" | "multi" = body.mode === "multi" ? "multi" : "single";
  const additionalPageUrls = Array.isArray(body.additional_page_urls)
    ? (body.additional_page_urls as unknown[])
        .filter((u): u is string => typeof u === "string")
        .slice(0, 20)
    : [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("test_runs")
    .insert({
      url: body.url.trim(),
      page_title: pageTitle,
      raw_result: {
        test_cases: cases,
        crud_execution: crudExecution,
        language,
        mode,
        additional_page_urls: additionalPageUrls,
      },
      element_summary: {
        ...(summary ?? {}),
        used_login: usedLogin,
        login_url: loginUrl,
        auto_crud: autoCrud,
        language,
        mode,
        pages_crawled: 1 + additionalPageUrls.length,
      },
    })
    .select("id, created_at")
    .single();

  if (error) {
    const msg = error.message ?? String(error);
    const isNetwork =
      msg.includes("fetch failed") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("NXDOMAIN");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "Supabase";
    const detail = isNetwork
      ? `Koneksi ke Supabase (${supabaseUrl}) gagal (ENOTFOUND / fetch failed). Proyek Supabase kamu kemungkinan sedang PAUSED di Supabase Dashboard (https://supabase.com) atau URL di .env.local tidak valid.`
      : `Gagal simpan ke Supabase: ${msg}`;
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  return NextResponse.json({
    id: data.id,
    created_at: data.created_at,
  });
}
