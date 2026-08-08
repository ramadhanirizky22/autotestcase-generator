/**
 * Generate plausible test values for form fields based on type / label /
 * placeholder hints. The goal is to pass typical client-side validation
 * (email format, number, required) without using real-looking data.
 *
 * All generated values include the `uniqueId` so we can locate the
 * created row later and clean it up.
 */

export type FieldHint = {
  type: string;
  name?: string | null;
  label?: string | null;
  placeholder?: string | null;
  required: boolean;
  pattern?: string | null;
  maxlength?: number | null;
};

export type GenContext = {
  uniqueId: string;
};

const truncate = (s: string, max?: number | null) =>
  max && max > 0 && s.length > max ? s.slice(0, max) : s;

function hint(field: FieldHint): string {
  return [field.label, field.name, field.placeholder]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Returns a value to fill, or `null` if the field type is not fillable
 * (file, hidden, submit, etc.) — caller should skip those.
 */
export function generateValue(field: FieldHint, ctx: GenContext): string | null {
  const t = (field.type || "text").toLowerCase();
  const h = hint(field);
  const max = field.maxlength;

  // Non-fillable types — handled differently or skipped.
  if (
    t === "hidden" ||
    t === "submit" ||
    t === "button" ||
    t === "reset" ||
    t === "file" ||
    t === "image" ||
    t === "checkbox" ||
    t === "radio"
  ) {
    return null;
  }

  // Email
  if (t === "email" || /\b(email|e-mail|surel)\b/.test(h)) {
    return truncate(`autotest.${ctx.uniqueId}@example.com`, max);
  }

  // Password (rarely in CRUD but handle)
  if (t === "password" || /\b(password|sandi|kata\s*sandi)\b/.test(h)) {
    return truncate(`AutoTest!${ctx.uniqueId}`, max);
  }

  // Phone
  if (t === "tel" || /\b(phone|telepon|telp|hp|whatsapp|wa)\b/.test(h)) {
    return truncate("081234567890", max);
  }

  // URL
  if (t === "url" || /\b(url|website|link|situs)\b/.test(h)) {
    return truncate("https://example.com/auto-test", max);
  }

  // Date / time
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  if (t === "date" || /\b(date|tanggal|tgl)\b/.test(h)) {
    return `${yyyy}-${mm}-${dd}`;
  }
  if (t === "datetime-local") {
    return `${yyyy}-${mm}-${dd}T12:00`;
  }
  if (t === "time" || /\b(time|jam|waktu)\b/.test(h)) {
    return "12:00";
  }
  if (t === "month") return `${yyyy}-${mm}`;
  if (t === "week") return `${yyyy}-W01`;

  // Number / currency / quantity
  if (
    t === "number" ||
    /\b(price|harga|amount|jumlah|qty|quantity|stock|stok|umur|age|year|tahun)\b/.test(h)
  ) {
    return "1";
  }

  // Pattern-aware: if pattern is just digits, return digits
  if (field.pattern) {
    if (/^\\?d/i.test(field.pattern)) return truncate("1234567890", max);
  }

  // Address-like fields can be longer
  if (/\b(address|alamat|street|jalan|description|deskripsi|note|catatan|keterangan)\b/.test(h)) {
    return truncate(`Auto Test alamat ${ctx.uniqueId}`, max);
  }

  // Name / title — prefer including the unique id so we can find the row
  if (/\b(name|nama|title|judul|kode|code)\b/.test(h)) {
    return truncate(`Auto Test ${ctx.uniqueId}`, max);
  }

  // Generic text fallback — also include unique id.
  return truncate(`Auto Test ${ctx.uniqueId}`, max);
}

/**
 * Build a unique identifier safe for use in form values. Short enough
 * to fit even in fields with maxlength=20, but long enough to be
 * unique within a test run.
 */
export function makeUniqueId(): string {
  // 9 chars: epoch seconds (8) → unique each second, plus 1 random char.
  const epoch = Math.floor(Date.now() / 1000)
    .toString(36)
    .toUpperCase()
    .padStart(7, "0");
  const r = Math.floor(Math.random() * 36).toString(36).toUpperCase();
  return `${epoch}${r}`;
}
