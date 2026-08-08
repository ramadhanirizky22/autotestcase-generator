import { chromium, type Browser, type Page } from "playwright";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCrudCycle, type CrudExecutionResult } from "./crud-runner";

export type ExtractedInput = {
  type: string;
  name: string | null;
  id: string | null;
  label: string | null;
  placeholder: string | null;
  required: boolean;
  pattern: string | null;
  maxlength: number | null;
};

export type ExtractedForm = {
  name: string | null;
  id: string | null;
  action: string | null;
  method: string | null;
  inputs: ExtractedInput[];
};

export type ExtractedButton = {
  text: string;
  type: string | null;
  id: string | null;
  name: string | null;
};

export type ExtractedLink = {
  text: string;
  href: string;
};

export type ExtractedHeading = {
  level: number;
  text: string;
};

export type ExtractedTable = {
  headers: string[];
  rowCount: number;
  /** Texts from buttons/links in the first data row — usually edit/delete actions. */
  rowActions: string[];
};

export type CrudHints = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  view: boolean;
  save: boolean;
  cancel: boolean;
  search: boolean;
  filter: boolean;
  export: boolean;
  import: boolean;
  pagination: boolean;
  modal: boolean;
};

export type PageData = {
  url: string;
  finalUrl: string;
  title: string;
  forms: ExtractedForm[];
  buttons: ExtractedButton[];
  links: ExtractedLink[];
  headings: ExtractedHeading[];
  navItems: string[];
  tables: ExtractedTable[];
  crudHints: CrudHints;
};

export type CrawlResult = {
  url: string;
  finalUrl: string;
  title: string;
  forms: ExtractedForm[];
  buttons: ExtractedButton[];
  links: ExtractedLink[];
  headings: ExtractedHeading[];
  navItems: string[];
  tables: ExtractedTable[];
  crudHints: CrudHints;
  /**
   * Set when a login flow was performed. `usedLogin` indicates the
   * crawl is of an authenticated page so the LLM should produce
   * post-login test cases.
   */
  usedLogin?: boolean;
  loginUrl?: string;
  /** Populated when `opts.runCrud` is true. */
  crudExecution?: CrudExecutionResult;
  /** Populated when CRAWLER_TRACE=true — local filesystem path to a .zip Playwright trace. */
  tracePath?: string;
  /**
   * When `opts.mode === "multi"` and additional same-origin pages
   * were visited, their extraction data lives here. The `pages` array
   * does NOT include the main URL — that's already in this object's
   * top-level fields.
   */
  additionalPages?: PageData[];
};

/**
 * Login config used by the crawler. Credentials are NEVER persisted —
 * they only live in memory for this single request.
 */
export type LoginConfig = {
  loginUrl: string;
  username: string;
  password: string;
  /** Optional selector overrides if auto-detect fails. */
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  /**
   * After clicking submit, the URL we expect to be NOT on (defaults
   * to the login URL itself). Used to verify login succeeded.
   */
  successUrlContains?: string;
};

export type CrawlErrorArtifacts = {
  screenshotPath?: string;
  tracePath?: string;
};

export class CrawlError extends Error {
  code:
    | "INVALID_URL"
    | "TIMEOUT"
    | "NAV_FAILED"
    | "AUTH_REQUIRED"
    | "LOGIN_FAILED"
    | "LOGIN_FORM_NOT_FOUND"
    | "EMPTY_PAGE"
    | "UNKNOWN";
  artifacts: CrawlErrorArtifacts;
  constructor(code: CrawlError["code"], message: string, artifacts: CrawlErrorArtifacts = {}) {
    super(message);
    this.code = code;
    this.artifacts = artifacts;
  }
}

function validateUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new CrawlError("INVALID_URL", "URL tidak valid. Pastikan diawali http:// atau https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CrawlError("INVALID_URL", "Hanya protokol http/https yang didukung.");
  }
  return url;
}

/**
 * Try to detect & fill a login form, submit, and wait for the page
 * to react. We do NOT verify login success here — the caller verifies
 * by navigating to the target URL and checking whether a login form
 * appears (which would mean we got redirected back).
 */
async function performLogin(
  page: Page,
  cfg: LoginConfig,
  timeout: number
): Promise<{ beforeUrl: string; afterUrl: string; clickedSelector: string | null }> {
  // Wait for the password field to render (most reliable anchor for a login form).
  const passSelector = cfg.passwordSelector ?? 'input[type="password"]';
  const passLocator = page.locator(passSelector).first();
  try {
    await passLocator.waitFor({ state: "visible", timeout });
  } catch {
    throw new CrawlError(
      "LOGIN_FORM_NOT_FOUND",
      "Tidak menemukan field password di halaman login. Pastikan URL login benar atau pakai 'Selector kustom'."
    );
  }

  // Detect username field. Priority: explicit selector → email type → common name/id patterns → first non-password input inside the same form.
  // NOTE: we deliberately avoid Playwright pseudo-classes like `:visible`
  // and CSS Level 4 case-insensitive flags inside attribute selectors here,
  // because combining them with quoted attribute selectors can confuse
  // Playwright's selector parser.
  const userSelectors = cfg.usernameSelector
    ? [cfg.usernameSelector]
    : [
        'input[type="email"]',
        'input[name*="email"]',
        'input[name*="Email"]',
        'input[name*="user"]',
        'input[name*="User"]',
        'input[name*="login"]',
        'input[name*="Login"]',
        'input[id*="email"]',
        'input[id*="Email"]',
        'input[id*="user"]',
        'input[id*="User"]',
        'input[id*="login"]',
        'input[id*="Login"]',
        'form:has(input[type="password"]) input[type="text"]',
        'form:has(input[type="password"]) input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"]):not([type="button"])',
      ];

  let userLocator: ReturnType<Page["locator"]> | null = null;
  for (const sel of userSelectors) {
    const loc = page.locator(sel).first();
    try {
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        userLocator = loc;
        break;
      }
    } catch {
      // selector might be invalid for this page; just skip it
    }
  }

  if (!userLocator) {
    throw new CrawlError(
      "LOGIN_FORM_NOT_FOUND",
      "Tidak menemukan field username/email di halaman login. Coba isi 'Selector kustom' secara manual."
    );
  }

  // Fill credentials. We use pressSequentially with a small delay so
  // React/Vue controlled inputs fire all input events. After each
  // field we press Tab to dispatch a blur event — many SPAs only run
  // validation (and enable the submit button) on blur.
  await userLocator.click({ timeout }).catch(() => {});
  await userLocator.fill("", { timeout }).catch(() => {});
  await userLocator.pressSequentially(cfg.username, { delay: 25 });
  await userLocator.press("Tab").catch(() => {});

  await passLocator.click({ timeout }).catch(() => {});
  await passLocator.fill("", { timeout }).catch(() => {});
  await passLocator.pressSequentially(cfg.password, { delay: 25 });
  await passLocator.press("Tab").catch(() => {});

  // Capture URL right before submit so we can detect any change.
  const beforeUrl = page.url();

  // Submit. Try explicit selector → submit button inside the password's form → button with login-like text → press Enter as fallback.
  const submitSelectors = cfg.submitSelector
    ? [cfg.submitSelector]
    : [
        'form:has(input[type="password"]) button[type="submit"]',
        'form:has(input[type="password"]) input[type="submit"]',
        'button[type="submit"]',
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
        'button:has-text("Login")',
        'button:has-text("Masuk")',
      ];

  let clicked = false;
  let clickedSelector: string | null = null;
  for (const sel of submitSelectors) {
    const btn = page.locator(sel).first();
    try {
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        // Wait briefly for the button to become enabled. Some forms
        // disable submit until validation passes; if the wait times
        // out we still click — the click will fail silently if
        // disabled and we'll surface that as a login failure later.
        await btn
          .waitFor({ state: "visible", timeout: 2000 })
          .catch(() => {});
        const isDisabled = await btn.isDisabled().catch(() => false);
        if (!isDisabled) {
          await btn.click({ timeout, noWaitAfter: true }).catch(() => {});
          clicked = true;
          clickedSelector = sel;
          break;
        }
      }
    } catch {
      // ignore and try next
    }
  }
  if (!clicked) {
    // Fallback: press Enter in password field.
    await passLocator.press("Enter").catch(() => {});
    clickedSelector = "Enter key on password field";
  }

  // Wait for an actual progress signal: URL change OR password field
  // disappears. We deliberately do NOT include `waitForLoadState
  // ("networkidle")` here because the page may already be idle at the
  // moment the click is dispatched (especially for SPAs), causing
  // networkidle to resolve immediately before navigation even starts.
  await Promise.race([
    page
      .waitForURL((url) => String(url) !== beforeUrl, { timeout })
      .catch(() => null),
    page
      .locator('input[type="password"]')
      .first()
      .waitFor({ state: "hidden", timeout })
      .catch(() => null),
    // Hard ceiling so we don't hang the request if neither signal
    // ever fires.
    new Promise<void>((resolve) => setTimeout(resolve, timeout)),
  ]);

  // Let the destination page settle. This is best-effort — we don't
  // verify login success here. The caller will navigate to the target
  // URL next and infer login success from whether the target page
  // shows a login form again.
  await page.waitForLoadState("load", { timeout: 8000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Capture submit metadata for debugging on later failure.
  return {
    beforeUrl,
    afterUrl: page.url(),
    clickedSelector,
  };
}

/**
 * Extract elements from the currently loaded page. Pure DOM eval —
 * no navigation.
 */
async function extractElements(page: Page) {
  return page.evaluate(() => {
    function visibleText(el: Element | null): string {
      if (!el) return "";
      return (el as HTMLElement).innerText?.trim().replace(/\s+/g, " ") ?? "";
    }

    function labelFor(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | null {
      if (input.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (lab) return visibleText(lab);
      }
      const wrapping = input.closest("label");
      if (wrapping) return visibleText(wrapping);
      const aria = input.getAttribute("aria-label");
      if (aria) return aria.trim();
      const ariaBy = input.getAttribute("aria-labelledby");
      if (ariaBy) {
        const ref = document.getElementById(ariaBy);
        if (ref) return visibleText(ref);
      }
      return null;
    }

    function isVisible(el: Element): boolean {
      const e = el as HTMLElement;
      if (!e.getClientRects || e.getClientRects().length === 0) return false;
      const style = window.getComputedStyle(e);
      return style.visibility !== "hidden" && style.display !== "none";
    }

    const forms = Array.from(document.querySelectorAll("form")).map((f) => {
      const inputs = Array.from(
        f.querySelectorAll("input, select, textarea")
      ).map((i) => {
        const el = i as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const type =
          el.tagName.toLowerCase() === "input"
            ? (el as HTMLInputElement).type || "text"
            : el.tagName.toLowerCase();
        const maxAttr = el.getAttribute("maxlength");
        return {
          type,
          name: el.getAttribute("name"),
          id: el.id || null,
          label: labelFor(el),
          placeholder: el.getAttribute("placeholder"),
          required: el.hasAttribute("required"),
          pattern: el.getAttribute("pattern"),
          maxlength: maxAttr ? Number(maxAttr) : null,
        };
      });
      return {
        name: f.getAttribute("name"),
        id: f.id || null,
        action: f.getAttribute("action"),
        method: f.getAttribute("method"),
        inputs,
      };
    });

    const buttons = Array.from(
      document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')
    )
      .filter(isVisible)
      .slice(0, 60)
      .map((b) => {
        const el = b as HTMLButtonElement | HTMLInputElement;
        const text =
          (el as HTMLInputElement).value ||
          visibleText(el) ||
          el.getAttribute("aria-label") ||
          "";
        return {
          text: text.slice(0, 80),
          type: el.getAttribute("type"),
          id: el.id || null,
          name: el.getAttribute("name"),
        };
      })
      .filter((b) => b.text);

    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter(isVisible)
      .slice(0, 80)
      .map((a) => {
        const el = a as HTMLAnchorElement;
        return {
          text: visibleText(el).slice(0, 80),
          href: el.getAttribute("href") || "",
        };
      })
      .filter((l) => l.text || l.href);

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .slice(0, 40)
      .map((h) => ({
        level: Number(h.tagName.substring(1)),
        text: visibleText(h).slice(0, 120),
      }))
      .filter((h) => h.text);

    const navItems = Array.from(
      document.querySelectorAll('nav a, [role="navigation"] a, header a')
    )
      .slice(0, 30)
      .map((a) => visibleText(a))
      .filter(Boolean);

    // Tables — capture data tables for CRUD inference. Skip tiny
    // layout tables (less than 2 columns or no rows).
    const tables = Array.from(
      document.querySelectorAll('table, [role="table"]')
    )
      .slice(0, 5)
      .map((t) => {
        const headerEls = t.querySelectorAll(
          'thead th, [role="columnheader"], thead td'
        );
        const headers = Array.from(headerEls)
          .slice(0, 20)
          .map((h) => visibleText(h).slice(0, 60))
          .filter(Boolean);
        const bodyRows = t.querySelectorAll(
          'tbody tr, [role="rowgroup"] [role="row"]'
        );
        const rowCount = bodyRows.length;
        // Look at first body row, gather action button/link texts.
        const firstRow = bodyRows[0];
        const rowActions = firstRow
          ? Array.from(
              firstRow.querySelectorAll('button, a[href], [role="button"]')
            )
              .slice(0, 10)
              .map((b) => {
                const el = b as HTMLElement;
                return (
                  visibleText(el) ||
                  el.getAttribute("aria-label") ||
                  el.getAttribute("title") ||
                  ""
                ).slice(0, 30);
              })
              .filter(Boolean)
          : [];
        return { headers, rowCount, rowActions };
      })
      .filter((t) => t.headers.length >= 2 || t.rowCount > 0);

    // Pagination detection — common patterns.
    const hasPagination = !!document.querySelector(
      [
        '[role="navigation"][aria-label*="pagination" i]',
        '[class*="pagination" i]',
        '[class*="Pagination"]',
        'nav[aria-label*="page" i]',
        'button[aria-label*="next page" i]',
        'button[aria-label*="previous page" i]',
        ".page-link",
        ".ant-pagination",
        ".MuiPagination-root",
      ].join(", ")
    );

    // Modal/dialog detection — even hidden modals signal CRUD UX.
    const hasModal = !!document.querySelector(
      [
        '[role="dialog"]',
        '[role="alertdialog"]',
        ".modal",
        '[class*="Modal"]',
        '[class*="modal-"]',
        ".ant-modal",
        ".MuiDialog-root",
      ].join(", ")
    );

    return {
      title: document.title,
      forms,
      buttons,
      links,
      headings,
      navItems: Array.from(new Set(navItems)),
      tables,
      hasPagination,
      hasModal,
    };
  });
}

export type CrawlOptions = {
  /** Optional login flow. When set, the crawler logs in first then navigates to `targetUrl`. */
  login?: LoginConfig;
  /**
   * When true, runs an automated CRUD cycle (Create → Read → Update →
   * Delete) on the loaded page using auto-generated test data.
   * Strictly opt-in — generates real records on the target system.
   */
  runCrud?: boolean;
  /**
   * Crawl mode. "single" extracts only the given URL. "multi" extracts
   * the given URL and follows same-origin internal links up to
   * `maxPages` pages total (including the main page).
   */
  mode?: "single" | "multi";
  /** Hard cap on total pages visited in multi mode. Default 5, max 10. */
  maxPages?: number;
};

const INTENT_PATTERNS: Array<{ key: keyof CrudHints; re: RegExp }> = [
  { key: "create", re: /\b(add|new|create|tambah|buat|baru|insert)\b|^\+$/i },
  { key: "edit", re: /\b(edit|ubah|update|modify|rename)\b/i },
  { key: "delete", re: /\b(delete|hapus|remove|trash|destroy)\b/i },
  { key: "view", re: /\b(view|lihat|detail|details|show|preview)\b/i },
  { key: "save", re: /\b(save|simpan|submit|confirm|konfirmasi|ok)\b/i },
  { key: "cancel", re: /\b(cancel|batal|close|tutup|dismiss)\b/i },
  { key: "search", re: /\b(search|cari|find)\b/i },
  { key: "filter", re: /\b(filter|sort|urutkan)\b/i },
  { key: "export", re: /\b(export|download|unduh|csv|xlsx|excel)\b/i },
  { key: "import", re: /\b(import|upload|unggah)\b/i },
];

function inferCrudHints(
  buttons: ExtractedButton[],
  tables: ExtractedTable[],
  hasPagination: boolean,
  hasModal: boolean
): CrudHints {
  const hints: CrudHints = {
    create: false,
    edit: false,
    delete: false,
    view: false,
    save: false,
    cancel: false,
    search: false,
    filter: false,
    export: false,
    import: false,
    pagination: hasPagination,
    modal: hasModal,
  };

  const allTexts: string[] = [
    ...buttons.map((b) => b.text),
    ...tables.flatMap((t) => t.rowActions),
  ];
  for (const text of allTexts) {
    for (const { key, re } of INTENT_PATTERNS) {
      if (re.test(text)) hints[key] = true;
    }
  }
  return hints;
}

/**
 * Pull same-origin, http(s)-only links from a page's extracted data,
 * normalize them, dedupe, and exclude the start URL itself plus
 * file-extension or anchor-only links.
 */
function collectInternalLinks(
  data: { links: ExtractedLink[]; navItems: string[] },
  baseUrl: string
): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const out = new Set<string>();
  const skipExt = /\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|tar|gz|mp4|mov|csv|xlsx?|docx?)$/i;
  for (const l of data.links) {
    const href = l.href || "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    let u: URL;
    try {
      u = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (u.origin !== base.origin) continue;
    if (skipExt.test(u.pathname)) continue;
    u.hash = "";
    if (u.href === base.href) continue;
    out.add(u.href);
  }
  return Array.from(out);
}

/**
 * Navigate to `url` in the given page and run the standard
 * extraction. Throws CrawlError on navigation timeout / failure.
 */
async function extractAt(page: Page, url: string, timeout: number): Promise<PageData> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/timeout/i.test(msg)) {
      throw new CrawlError("TIMEOUT", `Halaman ${url} tidak selesai loading dalam ${timeout}ms.`);
    }
    throw new CrawlError("NAV_FAILED", `Gagal navigasi ke ${url}: ${msg}`);
  }
  const data = await extractElements(page);
  const crudHints = inferCrudHints(
    data.buttons,
    data.tables,
    data.hasPagination,
    data.hasModal
  );
  return {
    url,
    finalUrl: page.url(),
    title: data.title,
    forms: data.forms,
    buttons: data.buttons,
    links: data.links,
    headings: data.headings,
    navItems: data.navItems,
    tables: data.tables,
    crudHints,
  };
}

/**
 * Crawl a single page (optionally after performing a login flow) and
 * return a compact summary of interactive elements.
 */
export async function crawlPage(
  rawTargetUrl: string,
  opts: CrawlOptions = {}
): Promise<CrawlResult> {
  const targetUrl = validateUrl(rawTargetUrl);
  if (opts.login) validateUrl(opts.login.loginUrl);

  const timeout = Number(process.env.CRAWLER_TIMEOUT_MS ?? 20000);
  // Set CRAWLER_HEADLESS=false in .env.local to watch the browser
  // run live — useful when debugging login flows.
  const headless = process.env.CRAWLER_HEADLESS !== "false";
  // Slow motion delay (ms) between Playwright actions. Useful when
  // running headed to actually follow the flow with your eyes.
  const slowMo = Math.max(0, Number(process.env.CRAWLER_SLOWMO_MS ?? 0));
  // CRAWLER_TRACE=true → capture a Playwright trace.zip per run.
  // Replay with: npx playwright show-trace <path>
  const traceEnabled = process.env.CRAWLER_TRACE === "true";

  let browser: Browser | null = null;
  let tracePath: string | null = null;
  try {
    browser = await chromium.launch({
      headless,
      slowMo,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (compatible; AutoTestCaseBot/1.0; +https://example.com/bot)",
      viewport: { width: 1280, height: 800 },
    });
    await context.addInitScript("window.__name = window.__name || ((fn) => fn);");
    if (traceEnabled) {
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false,
      });
    }
    const page = await context.newPage();

    // Step 1: optional login flow.
    let loginInfo: { beforeUrl: string; afterUrl: string; clickedSelector: string | null } | null = null;
    if (opts.login) {
      try {
        await page.goto(opts.login.loginUrl, {
          waitUntil: "domcontentloaded",
          timeout,
        });
        await page
          .waitForLoadState("networkidle", { timeout })
          .catch(() => {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new CrawlError(
          /timeout/i.test(msg) ? "TIMEOUT" : "NAV_FAILED",
          `Gagal membuka halaman login: ${msg}`
        );
      }
      loginInfo = await performLogin(page, opts.login, timeout);
    }

    // Step 2: navigate to target page.
    try {
      await page.goto(targetUrl.toString(), {
        waitUntil: "domcontentloaded",
        timeout,
      });
      await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/timeout/i.test(msg)) {
        throw new CrawlError(
          "TIMEOUT",
          `Halaman tidak selesai loading dalam ${timeout}ms.`
        );
      }
      throw new CrawlError("NAV_FAILED", `Gagal navigasi ke URL: ${msg}`);
    }

    const finalUrl = page.url();

    // Heuristic: detect login-walls. If we DID log in but still hit a
    // login form on the target page, that means the login didn't take.
    const authHint = await page.evaluate(() => {
      const text = document.body?.innerText?.toLowerCase() ?? "";
      const passEl = document.querySelector(
        'input[type="password"]'
      ) as HTMLElement | null;
      const hasVisiblePassword = !!(
        passEl &&
        passEl.offsetParent !== null &&
        window.getComputedStyle(passEl).visibility !== "hidden"
      );
      const looksLikeLogin =
        /sign in|log in|login|masuk akun/.test(text) && hasVisiblePassword;
      return { hasVisiblePassword, looksLikeLogin };
    });

    if (authHint.looksLikeLogin) {
      if (opts.login) {
        // We tried to log in but the target page still shows a login
        // form → login didn't work. Capture a screenshot for the user.
        let screenshotPath = "";
        try {
          const p = join(tmpdir(), `autotc-login-fail-${Date.now()}.png`);
          const buf = await page.screenshot({ fullPage: false });
          await writeFile(p, buf);
          screenshotPath = p;
        } catch {
          // ignore
        }

        // Look for an error toast/message on the page.
        const errSelectors = [
          '[role="alert"]',
          '[role="status"]',
          ".error",
          ".alert",
          ".toast",
          ".notification",
          ".Toastify__toast",
          ".ant-message",
          ".ant-notification",
          ".MuiAlert-message",
          '[class*="error"]',
          '[class*="invalid"]',
        ];
        let errText = "";
        for (const sel of errSelectors) {
          const t = await page
            .locator(sel)
            .first()
            .innerText({ timeout: 500 })
            .catch(() => "");
          if (t && t.trim()) {
            errText = t.trim();
            break;
          }
        }

        const detail = errText
          ? ` Pesan dari halaman: "${errText.slice(0, 200)}".`
          : " Tidak ada pesan error terdeteksi.";
        const debugBits: string[] = [];
        if (loginInfo) {
          debugBits.push(`tombol: ${loginInfo.clickedSelector ?? "(tidak ada)"}`);
          debugBits.push(`URL setelah submit: ${loginInfo.afterUrl}`);
        }
        debugBits.push(`URL target final: ${finalUrl}`);
        if (screenshotPath) debugBits.push(`screenshot: ${screenshotPath}`);
        const debug = ` [Debug: ${debugBits.join(" | ")}]`;

        throw new CrawlError(
          "LOGIN_FAILED",
          `Login gagal — setelah submit, halaman target masih menampilkan form login.${detail}${debug}`,
          screenshotPath ? { screenshotPath } : undefined
        );
      }
      // No login was attempted — surface the standard auth wall message.
      throw new CrawlError(
        "AUTH_REQUIRED",
        "Halaman terlihat butuh login. Aktifkan opsi 'Login dulu sebelum crawl' dan isi kredensial."
      );
    }

    const data = await extractElements(page);

    if (
      data.forms.length === 0 &&
      data.buttons.length === 0 &&
      data.links.length === 0
    ) {
      throw new CrawlError(
        "EMPTY_PAGE",
        "Tidak ada elemen interaktif yang dapat dianalisis di halaman ini."
      );
    }

    const crudHints = inferCrudHints(
      data.buttons,
      data.tables,
      data.hasPagination,
      data.hasModal
    );

    // Multi-page mode: visit additional same-origin pages and extract
    // them too. This happens BEFORE runCrud so we capture clean
    // static state of every page first; we then return to the main
    // URL before kicking off auto-CRUD on it.
    let additionalPages: PageData[] | undefined;
    if (opts.mode === "multi") {
      const cap = Math.min(Math.max(2, opts.maxPages ?? 5), 10);
      // Reserve 1 slot for the main page (already extracted).
      const remaining = cap - 1;
      const candidates = collectInternalLinks(
        { links: data.links, navItems: data.navItems },
        finalUrl
      ).slice(0, remaining);

      additionalPages = [];
      for (const link of candidates) {
        try {
          const page2 = await extractAt(page, link, timeout);
          additionalPages.push(page2);
        } catch {
          // Skip individual page failures; multi-page is best-effort.
        }
      }
    }

    // Optional: run an automated CRUD cycle on the page. Done AFTER
    // static extraction so the test case generator still has a clean
    // snapshot of the original page state.
    let crudExecution: CrudExecutionResult | undefined;
    if (opts.runCrud) {
      // If we wandered off in multi mode, return to the main page
      // before running CRUD so the cycle operates on the original target.
      if (additionalPages && additionalPages.length > 0) {
        try {
          await page.goto(finalUrl, { waitUntil: "domcontentloaded", timeout });
          await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        } catch {
          // ignore — runCrud will surface its own error if needed
        }
      }
      crudExecution = await runCrudCycle(page);
    }

    // Save trace BEFORE returning so the path is included in the result.
    if (traceEnabled) {
      try {
        tracePath = join(tmpdir(), `autotc-trace-${Date.now()}.zip`);
        await context.tracing.stop({ path: tracePath });
      } catch {
        tracePath = null;
      }
    }

    return {
      url: rawTargetUrl,
      finalUrl,
      title: data.title,
      forms: data.forms,
      buttons: data.buttons,
      links: data.links,
      headings: data.headings,
      navItems: data.navItems,
      tables: data.tables,
      crudHints,
      usedLogin: Boolean(opts.login),
      loginUrl: opts.login?.loginUrl,
      crudExecution,
      tracePath: tracePath ?? undefined,
      additionalPages,
    };
  } catch (err) {
    // On failure, also save the trace (if enabled) and attach to the
    // error so the API route can store it with the failed-run folder.
    if (traceEnabled) {
      try {
        const failTrace = join(tmpdir(), `autotc-trace-FAIL-${Date.now()}.zip`);
        // `context` may be undefined if launch threw — guard.
        const ctx = browser?.contexts?.()[0];
        if (ctx) {
          await ctx.tracing.stop({ path: failTrace });
          if (err instanceof CrawlError) {
            err.artifacts = { ...err.artifacts, tracePath: failTrace };
          }
        }
      } catch {
        // ignore — trace capture is best-effort
      }
    }
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
