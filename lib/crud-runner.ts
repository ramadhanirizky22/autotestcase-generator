import type { Locator, Page } from "playwright";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateValue, makeUniqueId, type FieldHint } from "./test-data";
import type { TestCase } from "./supabase";

export type CrudOpStatus = "success" | "failed" | "skipped";
export type CrudOp = "create" | "read" | "update" | "delete";

export type CrudStep = {
  operation: CrudOp;
  status: CrudOpStatus;
  title: string;
  details: string;
  error?: string;
  screenshotPath?: string;
  durationMs: number;
};

export type CrudExecutionResult = {
  enabled: true;
  uniqueId: string;
  identifier: string | null;
  steps: CrudStep[];
};

const RE = {
  create: /\b(add|new|create|tambah|buat|baru|insert)\b|^\+$/i,
  edit: /\b(edit|ubah|update|modify)\b/i,
  delete: /\b(delete|hapus|remove|trash)\b/i,
  view: /\b(view|lihat|detail|details|show)\b/i,
  save: /\b(save|simpan|submit|create|tambah|update|ubah|ok|confirm|konfirmasi)\b/i,
  cancel: /\b(cancel|batal|close|tutup)\b/i,
  confirmDanger: /\b(yes|ya|delete|hapus|confirm|konfirmasi|ok)\b/i,
};

const STEP_TIMEOUT = 5000;

// ---------- helpers ----------

async function takeScreenshot(page: Page, label: string): Promise<string> {
  try {
    const p = join(tmpdir(), `autotc-crud-${label}-${Date.now()}.png`);
    const buf = await page.screenshot({ fullPage: false }).catch(() => null);
    if (!buf) return "";
    await writeFile(p, buf);
    return p;
  } catch {
    return "";
  }
}

async function elementText(el: Locator): Promise<string> {
  const text = (await el.textContent().catch(() => "")) ?? "";
  if (text.trim()) return text.trim();
  const aria = (await el.getAttribute("aria-label").catch(() => "")) ?? "";
  if (aria.trim()) return aria.trim();
  const title = (await el.getAttribute("title").catch(() => "")) ?? "";
  return title.trim();
}

/**
 * Find a visible action element (button / link / role=button) whose
 * accessible text matches `regex`. Optional `scope` narrows the search
 * to within a parent element.
 */
async function findActionByText(
  page: Page,
  regex: RegExp,
  scope?: Locator
): Promise<Locator | null> {
  const root = scope ?? page;
  const candidates = root.locator(
    'button, a[href], input[type="button"], input[type="submit"], [role="button"]'
  );
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const el = candidates.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const text = await elementText(el);
    if (text && regex.test(text)) return el;
  }
  return null;
}

/**
 * Find the visible modal/dialog scope on the page, if any.
 */
async function getModalScope(page: Page): Promise<Locator | null> {
  const sel = [
    '[role="dialog"]',
    '[role="alertdialog"]',
    ".ant-modal-content",
    ".MuiDialog-root .MuiDialog-paper",
    ".modal.show",
    ".modal.in",
    '[class*="Modal"][aria-hidden="false"]',
  ];
  for (const s of sel) {
    const loc = page.locator(s).first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
      return loc;
    }
  }
  return null;
}

/**
 * Find a row in any visible data table whose text content contains
 * `needle`. Returns null if not found.
 */
async function findRowByText(page: Page, needle: string): Promise<Locator | null> {
  const rows = page.locator(
    'table tbody tr, [role="rowgroup"] [role="row"]'
  );
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    if (!(await row.isVisible().catch(() => false))) continue;
    const text = (await row.textContent().catch(() => "")) ?? "";
    if (text.includes(needle)) return row;
  }
  return null;
}

async function getVisibleRowCount(page: Page): Promise<number> {
  const rows = page.locator('table tbody tr, [role="rowgroup"] [role="row"]');
  const total = await rows.count();
  let visible = 0;
  for (let i = 0; i < total; i++) {
    if (await rows.nth(i).isVisible().catch(() => false)) visible++;
  }
  return visible;
}

/**
 * Fill all fillable inputs in `scope` using the test-data generator.
 * Returns the value used for the first text field (used as identifier
 * for finding the row later).
 */
async function fillForm(
  scope: Locator,
  page: Page,
  uniqueId: string
): Promise<string> {
  let identifier = `Auto Test ${uniqueId}`;
  let firstTextValueUsed: string | null = null;

  // Inputs / textareas / selects.
  const fields = scope.locator("input, textarea, select");
  const count = await fields.count();

  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    if (await field.isDisabled().catch(() => false)) continue;
    if (await field.evaluate((el) => (el as HTMLInputElement).readOnly).catch(() => false)) continue;

    const tag = (await field.evaluate((e) => e.tagName.toLowerCase())) as string;
    const type =
      tag === "input"
        ? ((await field.getAttribute("type").catch(() => "text")) || "text")
        : tag;

    // SELECT — pick the first non-empty option.
    if (tag === "select") {
      const optionValues: string[] = await field.evaluate((sel) => {
        const s = sel as HTMLSelectElement;
        return Array.from(s.options)
          .filter((o) => o.value && !o.disabled)
          .map((o) => o.value);
      });
      if (optionValues.length > 0) {
        await field.selectOption(optionValues[0]).catch(() => {});
      }
      continue;
    }

    // CHECKBOX — check if required-ish.
    if (type === "checkbox") {
      const required = await field.evaluate((el) =>
        (el as HTMLInputElement).hasAttribute("required")
      ).catch(() => false);
      if (required) await field.check({ force: true }).catch(() => {});
      continue;
    }

    // RADIO — pick the first one in a group.
    if (type === "radio") {
      const name = await field.getAttribute("name").catch(() => null);
      if (name) {
        const first = page.locator(`input[type="radio"][name="${name}"]`).first();
        if ((await first.count()) > 0) {
          await first.check({ force: true }).catch(() => {});
        }
      }
      continue;
    }

    // Skip non-fillable text-likes.
    if (
      type === "hidden" ||
      type === "submit" ||
      type === "button" ||
      type === "reset" ||
      type === "file" ||
      type === "image"
    ) {
      continue;
    }

    // Build hint object and generate a value.
    const hint: FieldHint = {
      type,
      name: await field.getAttribute("name").catch(() => null),
      label: await field
        .evaluate((el) => {
          const id = (el as HTMLElement).id;
          if (id) {
            const lab = document.querySelector(
              `label[for="${CSS.escape(id)}"]`
            );
            if (lab) return (lab as HTMLElement).innerText.trim();
          }
          const wrap = (el as HTMLElement).closest("label");
          if (wrap) return (wrap as HTMLElement).innerText.trim();
          return el.getAttribute("aria-label") || null;
        })
        .catch(() => null),
      placeholder: await field.getAttribute("placeholder").catch(() => null),
      required: await field
        .evaluate((el) => (el as HTMLElement).hasAttribute("required"))
        .catch(() => false),
      pattern: await field.getAttribute("pattern").catch(() => null),
      maxlength: await field
        .getAttribute("maxlength")
        .then((v) => (v ? Number(v) : null))
        .catch(() => null),
    };

    const value = generateValue(hint, { uniqueId });
    if (value === null) continue;

    try {
      await field.fill("", { timeout: 1500 });
      await field.pressSequentially(value, { delay: 15 });
      await field.press("Tab").catch(() => {});
      // Capture the first text-like value as our identifier.
      if (firstTextValueUsed === null && (type === "text" || type === "search" || tag === "textarea")) {
        firstTextValueUsed = value;
      }
    } catch {
      // ignore single-field failures
    }
  }

  if (firstTextValueUsed) identifier = firstTextValueUsed;
  return identifier;
}

// ---------- step builders ----------

const success = (operation: CrudOp, title: string, details: string, durationMs: number, screenshotPath?: string): CrudStep => ({
  operation,
  status: "success",
  title,
  details,
  durationMs,
  screenshotPath,
});

const failed = (operation: CrudOp, title: string, error: string, durationMs: number, screenshotPath?: string): CrudStep => ({
  operation,
  status: "failed",
  title,
  details: error,
  error,
  durationMs,
  screenshotPath,
});

const skipped = (operation: CrudOp, reason: string, durationMs: number): CrudStep => ({
  operation,
  status: "skipped",
  title: "Dilewati",
  details: reason,
  durationMs,
});

// ---------- main runner ----------

export async function runCrudCycle(page: Page): Promise<CrudExecutionResult> {
  const steps: CrudStep[] = [];
  const uniqueId = makeUniqueId();
  let identifier: string | null = null;
  let createdRow: Locator | null = null;

  // ===== CREATE =====
  const tCreate = Date.now();
  try {
    const createBtn = await findActionByText(page, RE.create);
    if (!createBtn) {
      steps.push(skipped("create", "Tombol Create/Add/Tambah tidak ditemukan di halaman.", Date.now() - tCreate));
    } else {
      const beforeRowCount = await getVisibleRowCount(page);

      await createBtn.click({ timeout: STEP_TIMEOUT });
      await page.waitForTimeout(800);

      // Determine scope — modal if present, otherwise the whole page.
      const modal = await getModalScope(page);
      const scope = modal ?? page.locator("body");

      identifier = await fillForm(scope, page, uniqueId);

      // Click Save inside the form scope first; fall back to page-wide.
      let saveBtn = await findActionByText(page, RE.save, scope);
      if (!saveBtn) saveBtn = await findActionByText(page, RE.save);
      if (!saveBtn) {
        const ss = await takeScreenshot(page, "create-no-save");
        steps.push(failed("create", "Tombol Save/Simpan tidak ditemukan", "Tidak ada tombol save di form/modal.", Date.now() - tCreate, ss));
      } else {
        await saveBtn.click({ timeout: STEP_TIMEOUT });
        // Wait for either: modal closes, row count grows, or a settling.
        await page.waitForTimeout(2500);
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

        // Verify by finding the row with our identifier.
        createdRow = await findRowByText(page, identifier);
        const afterRowCount = await getVisibleRowCount(page);

        const ss = await takeScreenshot(page, "create-after");
        if (createdRow) {
          steps.push(success("create", "Create berhasil", `Submitted form dengan identifier "${identifier}". Baris baru ditemukan di tabel. Row count ${beforeRowCount} → ${afterRowCount}.`, Date.now() - tCreate, ss));
        } else if (afterRowCount > beforeRowCount) {
          steps.push(success("create", "Create kemungkinan berhasil", `Row count naik ${beforeRowCount} → ${afterRowCount}, tapi baris dengan "${identifier}" tidak ketemu (mungkin tabel auto-paginate ke halaman lain).`, Date.now() - tCreate, ss));
        } else {
          // Look for an error message in modal.
          const stillModal = await getModalScope(page);
          let errMsg = "";
          if (stillModal) {
            const errLoc = stillModal.locator('[role="alert"], .error, [class*="error"]').first();
            if ((await errLoc.count()) > 0) {
              errMsg = ((await errLoc.innerText().catch(() => "")) || "").trim();
            }
          }
          steps.push(failed("create", "Create tidak terverifikasi", `Setelah klik Save, baris dengan "${identifier}" tidak muncul dan row count tidak bertambah.${errMsg ? ` Pesan: "${errMsg}"` : ""}`, Date.now() - tCreate, ss));
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const ss = await takeScreenshot(page, "create-error");
    steps.push(failed("create", "Create error", msg, Date.now() - tCreate, ss));
  }

  // Close any leftover modal before next steps.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);

  // ===== READ =====
  const tRead = Date.now();
  try {
    // Prefer the row we just created; fall back to first visible row.
    const targetRow =
      createdRow && (await createdRow.isVisible().catch(() => false))
        ? createdRow
        : page.locator('table tbody tr, [role="rowgroup"] [role="row"]').first();

    if ((await targetRow.count()) === 0) {
      steps.push(skipped("read", "Tidak ada baris untuk di-read.", Date.now() - tRead));
    } else {
      const viewBtn = await findActionByText(page, RE.view, targetRow);
      if (!viewBtn) {
        // Many apps treat clicking the row as view. Try clicking the row.
        await targetRow.click({ timeout: STEP_TIMEOUT, trial: true }).catch(() => {});
        // We don't actually click destructively — just record skipped.
        steps.push(skipped("read", "Tombol View/Lihat/Detail tidak ditemukan di baris.", Date.now() - tRead));
      } else {
        await viewBtn.click({ timeout: STEP_TIMEOUT });
        await page.waitForTimeout(1200);
        const detailModal = await getModalScope(page);
        const ss = await takeScreenshot(page, "read");
        const hasDetail = !!detailModal || page.url() !== (await page.evaluate(() => location.href));
        steps.push(success("read", "Read berhasil", `Klik View/Detail menampilkan ${detailModal ? "modal detail" : "halaman detail"}.`, Date.now() - tRead, ss));
        // Close detail modal if any.
        await page.keyboard.press("Escape").catch(() => {});
        // If we navigated to a detail page, go back.
        if (!detailModal) {
          await page.goBack({ timeout: 5000 }).catch(() => {});
          await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        }
        await page.waitForTimeout(500);
        // Re-resolve the createdRow after navigation.
        if (identifier) createdRow = await findRowByText(page, identifier);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const ss = await takeScreenshot(page, "read-error");
    steps.push(failed("read", "Read error", msg, Date.now() - tRead, ss));
  }

  // ===== UPDATE =====
  const tUpdate = Date.now();
  try {
    if (!createdRow || !(await createdRow.isVisible().catch(() => false))) {
      steps.push(skipped("update", "Update dilewati karena Create tidak menghasilkan baris yang dapat dilacak.", Date.now() - tUpdate));
    } else {
      const editBtn = await findActionByText(page, RE.edit, createdRow);
      if (!editBtn) {
        steps.push(skipped("update", "Tombol Edit/Ubah tidak ditemukan di baris.", Date.now() - tUpdate));
      } else {
        await editBtn.click({ timeout: STEP_TIMEOUT });
        await page.waitForTimeout(800);

        const modal = await getModalScope(page);
        const scope = modal ?? page.locator("body");

        // Modify the first visible text input by appending " (edited)".
        const firstText = scope.locator(
          'input[type="text"]:not([readonly]):not([disabled]), input:not([type]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])'
        ).first();
        let newIdentifier = identifier;
        if ((await firstText.count()) > 0 && (await firstText.isVisible().catch(() => false))) {
          const current = (await firstText.inputValue().catch(() => "")) || identifier || `Auto Test ${uniqueId}`;
          const updated = `${current} (edited)`.slice(0, 80);
          await firstText.fill("");
          await firstText.pressSequentially(updated, { delay: 15 });
          await firstText.press("Tab").catch(() => {});
          newIdentifier = updated;
        }

        let saveBtn = await findActionByText(page, RE.save, scope);
        if (!saveBtn) saveBtn = await findActionByText(page, RE.save);
        if (!saveBtn) {
          const ss = await takeScreenshot(page, "update-no-save");
          steps.push(failed("update", "Tombol Save tidak ditemukan saat Update", "", Date.now() - tUpdate, ss));
        } else {
          await saveBtn.click({ timeout: STEP_TIMEOUT });
          await page.waitForTimeout(2000);
          await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
          const ss = await takeScreenshot(page, "update-after");

          // Verify by finding the updated row.
          const updatedRow = newIdentifier
            ? await findRowByText(page, newIdentifier)
            : null;
          if (updatedRow) {
            steps.push(success("update", "Update berhasil", `Field pertama diubah menjadi "${newIdentifier}" dan terverifikasi di tabel.`, Date.now() - tUpdate, ss));
            createdRow = updatedRow;
            identifier = newIdentifier;
          } else {
            steps.push(failed("update", "Update tidak terverifikasi", `Setelah Save, baris dengan "${newIdentifier}" tidak ditemukan.`, Date.now() - tUpdate, ss));
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const ss = await takeScreenshot(page, "update-error");
    steps.push(failed("update", "Update error", msg, Date.now() - tUpdate, ss));
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);

  // ===== DELETE (also acts as cleanup) =====
  const tDelete = Date.now();
  try {
    if (!createdRow) {
      steps.push(skipped("delete", "Delete dilewati karena tidak ada baris yang dibuat oleh test ini.", Date.now() - tDelete));
    } else if (!(await createdRow.isVisible().catch(() => false))) {
      // Row may have been removed by an unrelated action; try to find by identifier.
      if (identifier) createdRow = await findRowByText(page, identifier);
      if (!createdRow) {
        steps.push(skipped("delete", "Baris yang akan dihapus sudah tidak terlihat.", Date.now() - tDelete));
      }
    }
    if (createdRow && (await createdRow.isVisible().catch(() => false))) {
      const beforeRowCount = await getVisibleRowCount(page);
      const deleteBtn = await findActionByText(page, RE.delete, createdRow);
      if (!deleteBtn) {
        steps.push(skipped("delete", "Tombol Delete/Hapus tidak ditemukan di baris.", Date.now() - tDelete));
      } else {
        await deleteBtn.click({ timeout: STEP_TIMEOUT });
        await page.waitForTimeout(700);

        // Look for a confirmation modal/dialog and click confirm.
        const confirmModal = await getModalScope(page);
        if (confirmModal) {
          let confirmBtn = await findActionByText(page, RE.confirmDanger, confirmModal);
          if (!confirmBtn) confirmBtn = await findActionByText(page, RE.delete, confirmModal);
          if (confirmBtn) {
            await confirmBtn.click({ timeout: STEP_TIMEOUT });
          }
        }

        await page.waitForTimeout(1500);
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        const ss = await takeScreenshot(page, "delete-after");

        // Verify: row gone OR row count decreased.
        const stillThere = identifier ? await findRowByText(page, identifier) : null;
        const afterRowCount = await getVisibleRowCount(page);
        if (!stillThere) {
          steps.push(success("delete", "Delete berhasil", `Baris "${identifier}" tidak lagi terlihat. Row count ${beforeRowCount} → ${afterRowCount}.`, Date.now() - tDelete, ss));
        } else {
          steps.push(failed("delete", "Delete tidak terverifikasi", `Setelah konfirmasi, baris "${identifier}" masih ada di tabel.`, Date.now() - tDelete, ss));
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const ss = await takeScreenshot(page, "delete-error");
    steps.push(failed("delete", "Delete error", msg, Date.now() - tDelete, ss));
  }

  return {
    enabled: true,
    uniqueId,
    identifier,
    steps,
  };
}

// ---------- post-processing: prefill actual_result from CRUD evidence ----------

/**
 * Match a test case (by name keyword) to a CRUD operation that was
 * executed, and return a programmatically-generated `actual_result`
 * string based on the auto-CRUD step. We deliberately:
 *
 *  - skip test cases that already have a manually-filled `actual_result`
 *  - skip negative/validation/cancel scenarios — auto-CRUD only
 *    runs the happy path, so claiming a negative test "passed"
 *    would be misleading
 *
 * Returns a NEW array of cases. Original input is not mutated.
 */
export function inferActualResults(
  cases: TestCase[],
  crudExec: CrudExecutionResult
): TestCase[] {
  if (!crudExec || !Array.isArray(crudExec.steps)) return cases;

  // First success/failed step per operation wins.
  const stepByOp = new Map<CrudOp, CrudStep>();
  for (const step of crudExec.steps) {
    if (step.status === "skipped") continue;
    if (!stepByOp.has(step.operation)) stepByOp.set(step.operation, step);
  }
  if (stepByOp.size === 0) return cases;

  // Order matters — match longer / more specific operations first
  // (e.g., "delete" before "remove from list" generic).
  const KEYWORDS: Array<{ op: CrudOp; re: RegExp }> = [
    { op: "delete", re: /\b(delete|hapus|remove|trash)\b/i },
    { op: "update", re: /\b(update|edit|ubah|modify|rename)\b/i },
    { op: "read", re: /\b(view|lihat|detail|details|show|tampilkan|read)\b/i },
    { op: "create", re: /\b(create|add|new|tambah|buat|baru|insert)\b/i },
  ];

  // Skip test cases whose name implies a non-happy-path scenario.
  const NEGATIVE = /\b(invalid|empty|missing|without|cancel|tanpa|tidak\s*valid|kosong|batal|negative|fail|error|gagal|salah|expired|kadaluarsa|unauthorized|forbidden)\b/i;

  return cases.map((tc) => {
    if ((tc.actual_result ?? "").trim()) return tc; // user / LLM already filled
    if (tc.category === "Negative Test" || tc.category === "Validation") return tc;
    if (NEGATIVE.test(tc.test_case_name)) return tc;

    for (const { op, re } of KEYWORDS) {
      if (!re.test(tc.test_case_name)) continue;
      const step = stepByOp.get(op);
      if (!step) continue;

      const verdict = step.status === "success" ? "✓" : "✗";
      const errSuffix = step.error ? ` (${step.error})` : "";
      const text = `${verdict} Auto-CRUD: ${step.title}. ${step.details}${errSuffix}`;
      return { ...tc, actual_result: text.slice(0, 500) };
    }
    return tc;
  });
}
