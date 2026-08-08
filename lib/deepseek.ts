import type { CrawlResult } from "./crawler";
import type { TestCase } from "./supabase";

export class DeepSeekError extends Error {
  code: "MISSING_KEY" | "API_ERROR" | "PARSE_ERROR" | "EMPTY";
  rawContent?: string;
  constructor(code: DeepSeekError["code"], message: string, rawContent?: string) {
    super(message);
    this.code = code;
    if (rawContent) this.rawContent = rawContent;
  }
}

const SYSTEM_PROMPT = `You are a senior QA engineer. Given a JSON description of a single web page (forms, inputs, buttons, links, headings, navigation, tables, crud_hints), produce a comprehensive list of manual test cases.

Rules:
- Cover Functional, Validation, UI, and Negative Test categories.
- Prefer actionable steps that a manual tester can execute in a browser.
- Use the actual labels/placeholders/button texts from the page when naming fields and actions.
- For inputs with required/pattern/maxlength, derive corresponding validation and negative test cases.
- For each <a> link in main navigation, include at least one navigation test case.
- Aim for 12-30 test cases total. Do NOT pad with duplicates.
- Test IDs must be sequential: TC-001, TC-002, ...
- Priority: High for core flows and critical validations, Medium for standard flows, Low for cosmetic/UI.

When the input indicates the page is post-login (page.context = "authenticated"):
- Set "Precondition" to mention that the user is logged in.
- Add session/auth specific cases: logout flow, session timeout, accessing this URL when NOT logged in (should redirect to login), accessing it as a different role (if multi-role hinted).

When "additional_pages" is provided, the input describes MULTIPLE pages of the same application:
- Generate test cases that COLLECTIVELY cover the main page (page.url) and every entry in additional_pages.
- For each test case that targets a specific page, mention the URL or page title in the "Precondition" so the tester knows where to start.
- Aim to balance coverage — don't dedicate all cases to a single page. Roughly 30-50% of cases on the main page, the rest distributed across additional pages by importance (higher-traffic / form-heavy pages get more cases).
- Cross-page navigation cases ("From [page A] click link X, verify lands on [page B]") are encouraged when nav links connect them.
- Aim for 20-40 test cases total when multiple pages are present. Still cap at 40 to keep response size reasonable.

CRUD-aware generation — inspect crud_hints and tables fields:
- If crud_hints.create is true: generate "Create [entity] with valid data" (Functional, High), "Create with missing required fields" (Validation), "Create with invalid format" (Negative), "Cancel create form without saving" (Functional).
- If crud_hints.edit is true: "Edit existing [entity] field" (Functional), "Edit with empty required field" (Validation), "Cancel edit retains original value" (Functional).
- If crud_hints.delete is true: "Delete [entity] from list" (Functional, High), "Confirm delete dialog appears" (UI), "Cancel delete keeps the row" (Functional).
- If crud_hints.view is true: "Open [entity] detail from list row" (Functional).
- If a table is present: use its headers when describing entity fields (e.g., "Verify Name column displays the user's full name"). Reference rowActions when describing per-row buttons.
- If crud_hints.search is true: "Search returns matching results", "Search with no matches shows empty state" (Negative).
- If crud_hints.filter is true: "Apply filter narrows the list", "Clear filter restores full list".
- If crud_hints.pagination is true: "Navigate to next page", "Navigate to previous page", "Page indicator updates" (UI).
- If crud_hints.export is true: "Export downloads file in expected format".
- If crud_hints.modal is true and create/edit detected: "Modal closes on outside click" (UI), "Modal can be closed via close button or Esc key" (UI).

When crud_execution is present, this means an automated CRUD cycle was actually run on the page. Use it as ground truth:
- For each step with status "success": phrase the corresponding test case as a confirmed working flow. Mention the identifier value used (from crud_execution.identifier) in the precondition.
- For each step with status "failed": still emit a test case for that operation, but mark Priority "High" and add an extra Negative Test case noting the failure mode (use the error message in details).
- For steps with status "skipped": you may still emit a test case for that operation as a manual scenario to verify.

Return ONLY a JSON object with this exact shape:
{
  "test_cases": [
    {
      "test_id": "TC-001",
      "test_case_name": "string",
      "precondition": "string",
      "test_steps": ["1. step one", "2. step two"],
      "expected_result": "string",
      "actual_result": "",
      "priority": "High" | "Medium" | "Low",
      "category": "Functional" | "Validation" | "UI" | "Negative Test"
    }
  ]
}

actual_result rules:
- ALWAYS set actual_result to "" (empty string). The application will programmatically fill it from auto-CRUD execution evidence when applicable, and the tester will fill the rest manually after running the test. DO NOT pre-fill it yourself even when crud_execution data is available.`;

export type Language = "id" | "en";

const LANG_NAME: Record<Language, string> = {
  id: "Indonesian (Bahasa Indonesia)",
  en: "English",
};

function languageDirective(lang: Language): string {
  if (lang === "id") {
    return `\nLANGUAGE OUTPUT (IMPORTANT): Write all human-readable fields (test_case_name, precondition, every step in test_steps, expected_result) in natural Bahasa Indonesia. Use proper Indonesian QA terminology (e.g., "Verifikasi", "Pastikan", "User mengisi field..."). KEEP THE ENUM VALUES IN ENGLISH UNCHANGED:
- priority: High / Medium / Low (NOT Tinggi/Sedang/Rendah)
- category: Functional / Validation / UI / Negative Test (NOT Fungsional/Validasi/etc.)`;
  }
  return `\nLANGUAGE OUTPUT: Write all fields in clear professional English.`;
}

function buildUserPayload(crawl: CrawlResult) {
  // Trim aggressive — DeepSeek context is generous but we want speed.
  const payload: Record<string, unknown> = {
    page: {
      url: crawl.finalUrl,
      title: crawl.title,
      context: crawl.usedLogin ? "authenticated" : "public",
      login_url: crawl.loginUrl,
    },
    forms: crawl.forms.slice(0, 10).map((f) => ({
      id: f.id,
      action: f.action,
      method: f.method,
      inputs: f.inputs.slice(0, 25),
    })),
    buttons: crawl.buttons.slice(0, 40),
    links: crawl.links.slice(0, 50),
    headings: crawl.headings,
    nav_items: crawl.navItems,
    tables: crawl.tables.slice(0, 5),
    crud_hints: crawl.crudHints,
  };

  // Multi-page: include other crawled pages so DeepSeek covers them too.
  if (crawl.additionalPages && crawl.additionalPages.length > 0) {
    payload.additional_pages = crawl.additionalPages.slice(0, 9).map((p) => ({
      url: p.finalUrl,
      title: p.title,
      forms: p.forms.slice(0, 6).map((f) => ({
        id: f.id,
        method: f.method,
        inputs: f.inputs.slice(0, 15),
      })),
      buttons: p.buttons.slice(0, 25),
      links: p.links.slice(0, 25),
      headings: p.headings.slice(0, 15),
      tables: p.tables.slice(0, 3),
      crud_hints: p.crudHints,
    }));
  }

  // Auto-CRUD execution evidence — when present, the LLM should
  // reflect actual observed behavior in the test cases.
  if (crawl.crudExecution) {
    payload.crud_execution = {
      identifier: crawl.crudExecution.identifier,
      steps: crawl.crudExecution.steps.map((s) => ({
        operation: s.operation,
        status: s.status,
        title: s.title,
        details: s.details,
        error: s.error,
      })),
    };
  }

  return payload;
}

function sanitizeJsonStrings(str: string): string {
  let result = "";
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
      } else if (char === "\\") {
        result += char;
        isEscaped = true;
      } else if (char === '"') {
        result += char;
        inString = false;
      } else if (char === "\n") {
        result += "\\n";
      } else if (char === "\r") {
        result += "\\r";
      } else if (char === "\t") {
        result += "\\t";
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }

  return result;
}

function cleanJsonString(content: string): string {
  let cleaned = content.trim();

  // 1. Remove markdown code block fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // 2. Remove trailing commas before ] or }
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");

  // 3. Fix literal unescaped newlines/tabs inside string values
  cleaned = sanitizeJsonStrings(cleaned);

  return cleaned;
}

function extractPartialTestCases(content: string): unknown[] {
  const results: unknown[] = [];
  let depth = 0;
  let startIdx = -1;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === "{") {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && startIdx !== -1) {
        const candidate = content.slice(startIdx, i + 1);
        try {
          const parsed = JSON.parse(cleanJsonString(candidate));
          if (parsed && typeof parsed === "object" && (parsed.test_id || parsed.test_case_name)) {
            results.push(parsed);
          }
        } catch {}
        startIdx = -1;
      }
    }
  }

  return results;
}

function tryParseTestCases(content: string): TestCase[] {
  let rawCases: unknown[] | null = null;

  // Attempt 1: Cleaned JSON parse
  const cleaned = cleanJsonString(content);
  try {
    const parsed = JSON.parse(cleaned) as { test_cases?: unknown };
    if (parsed && Array.isArray(parsed.test_cases)) {
      rawCases = parsed.test_cases;
    }
  } catch {
    // Attempt 2: Extract brace-matched object substring
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(cleanJsonString(match[0])) as { test_cases?: unknown };
        if (parsed && Array.isArray(parsed.test_cases)) {
          rawCases = parsed.test_cases;
        }
      } catch {
        // Fall through
      }
    }
  }

  // Attempt 3: If JSON parse failed (e.g. truncated output), extract completed test cases
  if (!rawCases || rawCases.length === 0) {
    const partial = extractPartialTestCases(content);
    if (partial.length > 0) {
      rawCases = partial;
    }
  }

  if (!rawCases || rawCases.length === 0) {
    const snippet = content.slice(0, 300);
    throw new DeepSeekError(
      "PARSE_ERROR",
      `Gagal parse JSON dari respons DeepSeek. Cuplikan respons: ${snippet}`,
      content
    );
  }

  const allowedPriority = new Set(["High", "Medium", "Low"]);
  const allowedCategory = new Set(["Functional", "Validation", "UI", "Negative Test"]);

  const cases: TestCase[] = rawCases.map((c: unknown, idx: number) => {
    const tc = (c && typeof c === "object" ? c : {}) as Partial<TestCase> & { test_steps?: unknown };
    const steps = Array.isArray(tc.test_steps)
      ? tc.test_steps.map((s) => String(s))
      : [];
    return {
      test_id: typeof tc.test_id === "string" && tc.test_id ? tc.test_id : `TC-${String(idx + 1).padStart(3, "0")}`,
      test_case_name: String(tc.test_case_name ?? "").trim() || `Test case ${idx + 1}`,
      precondition: String(tc.precondition ?? "").trim(),
      test_steps: steps,
      expected_result: String(tc.expected_result ?? "").trim(),
      actual_result:
        typeof tc.actual_result === "string" ? tc.actual_result.trim() : "",
      priority: (allowedPriority.has(String(tc.priority)) ? tc.priority : "Medium") as TestCase["priority"],
      category: (allowedCategory.has(String(tc.category)) ? tc.category : "Functional") as TestCase["category"],
    };
  });

  if (cases.length === 0) {
    throw new DeepSeekError("EMPTY", "DeepSeek mengembalikan daftar test case kosong.", content);
  }
  return cases;
}

export async function generateTestCases(
  crawl: CrawlResult,
  options: { language?: Language } = {}
): Promise<TestCase[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekError(
      "MISSING_KEY",
      "DEEPSEEK_API_KEY belum di-set di environment."
    );
  }
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const language: Language = options.language === "en" ? "en" : "id";

  const payload = buildUserPayload(crawl);
  const systemPrompt = SYSTEM_PROMPT + languageDirective(language);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Generate test cases for this page. Page data follows as JSON:\n" +
            JSON.stringify(payload),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 8192,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DeepSeekError(
      "API_ERROR",
      `DeepSeek API error ${res.status}: ${text.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new DeepSeekError("EMPTY", "Respons DeepSeek kosong.");
  }

  return tryParseTestCases(content);
}

/**
 * Translate an existing list of test cases into the target language.
 * Keeps test_id, priority, and category enums unchanged. Uses a
 * single DeepSeek call.
 */
export async function translateTestCases(
  cases: TestCase[],
  targetLanguage: Language
): Promise<TestCase[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekError(
      "MISSING_KEY",
      "DEEPSEEK_API_KEY belum di-set di environment."
    );
  }
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const langName = LANG_NAME[targetLanguage] ?? LANG_NAME.id;

  const systemPrompt = `You are a professional QA test case translator. Translate the user-facing fields of every test case to ${langName}.

CRITICAL rules:
- DO NOT change: test_id, priority, category. They must be returned EXACTLY as-is.
- The priority enum stays as "High" | "Medium" | "Low" (English).
- The category enum stays as "Functional" | "Validation" | "UI" | "Negative Test" (English).
- DO translate: test_case_name, precondition, every string in test_steps[], expected_result.
- Preserve step numbering prefixes (e.g., "1. ", "2. ") at the start of each step.
- Use natural, professional QA language in the target locale.
- Preserve the exact same number of items and their order.

Return ONLY a JSON object with shape: { "test_cases": [...] }.`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Translate these test cases. Input as JSON:\n" +
            JSON.stringify({ test_cases: cases }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 8192,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DeepSeekError(
      "API_ERROR",
      `DeepSeek translate error ${res.status}: ${text.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new DeepSeekError("EMPTY", "Respons DeepSeek kosong.");
  }

  const translated = tryParseTestCases(content);
  if (translated.length !== cases.length) {
    // Mismatched length — fall back to the original to avoid losing data.
    throw new DeepSeekError(
      "PARSE_ERROR",
      `Jumlah test case berbeda setelah translate (${cases.length} → ${translated.length}).`
    );
  }
  // Force-preserve test_id, priority, category, and actual_result
  // from the original. actual_result is user-typed evidence —
  // translating it would corrupt their notes.
  return translated.map((tc, i) => ({
    ...tc,
    test_id: cases[i].test_id,
    priority: cases[i].priority,
    category: cases[i].category,
    actual_result: cases[i].actual_result ?? "",
  }));
}
