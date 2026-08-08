import { NextResponse } from "next/server";
import { buildTestCaseWorkbook } from "@/lib/excel";
import type { TestCase } from "@/lib/supabase";

export const runtime = "nodejs";

type ExportBody = {
  url?: string;
  pageTitle?: string | null;
  cases?: unknown;
};

function isTestCaseArray(v: unknown): v is TestCase[] {
  return Array.isArray(v) && v.every((c) => c && typeof c === "object");
}

export async function POST(req: Request) {
  let body: ExportBody;
  try {
    body = (await req.json()) as ExportBody;
  } catch {
    return NextResponse.json({ error: "Body harus JSON." }, { status: 400 });
  }

  if (!isTestCaseArray(body.cases)) {
    return NextResponse.json({ error: "Field 'cases' tidak valid." }, { status: 400 });
  }

  const buffer = await buildTestCaseWorkbook({
    url: body.url ?? "",
    pageTitle: body.pageTitle ?? null,
    cases: body.cases,
  });

  const filename = `testcases-${Date.now()}.xlsx`;
  // Wrap buffer in Uint8Array so NextResponse accepts it as BodyInit.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
