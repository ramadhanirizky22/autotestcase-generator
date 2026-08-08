import { NextResponse } from "next/server";
import { DeepSeekError, translateTestCases, type Language } from "@/lib/deepseek";
import type { TestCase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TranslateBody = {
  cases?: unknown;
  target?: unknown;
};

function isTestCaseArray(v: unknown): v is TestCase[] {
  return Array.isArray(v) && v.every((c) => c && typeof c === "object");
}

export async function POST(req: Request) {
  let body: TranslateBody;
  try {
    body = (await req.json()) as TranslateBody;
  } catch {
    return NextResponse.json({ error: "Body harus JSON." }, { status: 400 });
  }

  if (!isTestCaseArray(body.cases) || body.cases.length === 0) {
    return NextResponse.json(
      { error: "Field 'cases' wajib berisi array test case yang tidak kosong." },
      { status: 400 }
    );
  }

  const target: Language = body.target === "en" ? "en" : "id";

  try {
    const translated = await translateTestCases(body.cases, target);
    return NextResponse.json({ test_cases: translated, language: target });
  } catch (err) {
    if (err instanceof DeepSeekError) {
      const status =
        err.code === "MISSING_KEY" ? 500 :
        err.code === "PARSE_ERROR" ? 502 :
        err.code === "EMPTY" ? 502 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, code: "UNKNOWN" }, { status: 500 });
  }
}
