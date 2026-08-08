# AutoTestCase Generator

QA tool yang menghasilkan daftar test case otomatis dari sebuah URL website. Crawl 1 halaman dengan Playwright, kirim ringkasan elemen ke DeepSeek, simpan ke Supabase, dan tampilkan tabel test case yang bisa di-export ke Excel.

## Tech stack

- **Next.js 14** (App Router) — frontend + API routes dalam satu project
- **Playwright** — render & extract DOM (Node.js runtime API route)
- **DeepSeek** (`deepseek-chat`) — generate test case dengan `response_format: json_object`
- **Supabase** (Postgres) — simpan riwayat
- **Tailwind CSS** — styling
- **exceljs** — export `.xlsx`

## Quick start (lokal)

```bash
# 1. Install deps + Chromium
npm install

# 2. Salin env, lalu isi DEEPSEEK_API_KEY + Supabase keys
cp .env.example .env.local

# 3. Jalankan
npm run dev
```

Buka http://localhost:3000.

> Catatan: `npm install` akan otomatis menjalankan `playwright install chromium`. Kalau gagal, jalankan manual: `npx playwright install chromium`.

## Setup Supabase

1. Buat project baru di https://supabase.com.
2. Di dashboard, buka **SQL Editor** → tempel isi [`supabase/schema.sql`](./supabase/schema.sql) → Run.
3. Buka **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (rahasia, server-only)

Server menggunakan service-role key. Tabel di-set `RLS enabled` tanpa policy publik, jadi hanya bisa diakses dari server.

## Setup DeepSeek

1. Buat API key di https://platform.deepseek.com.
2. Set `DEEPSEEK_API_KEY` di `.env.local`.

## Struktur project

```
app/
  api/
    generate/route.ts   # crawl + DeepSeek + simpan ke Supabase
    export/route.ts     # build Excel
  history/
    page.tsx            # daftar riwayat
    [id]/page.tsx       # detail run
  layout.tsx
  page.tsx              # form generate
components/
  GenerateForm.tsx
  TestCaseTable.tsx
  ElementSummary.tsx
lib/
  crawler.ts            # Playwright extractor
  deepseek.ts           # DeepSeek client + JSON parsing
  excel.ts              # exceljs builder
  supabase.ts           # server-side Supabase client + types
supabase/schema.sql
```

## Format test case

Setiap test case berbentuk:

```jsonc
{
  "test_id": "TC-001",
  "test_case_name": "...",
  "precondition": "...",
  "test_steps": ["1. ...", "2. ..."],
  "expected_result": "...",
  "priority": "High" | "Medium" | "Low",
  "category": "Functional" | "Validation" | "UI" | "Negative Test"
}
```

DeepSeek dipanggil dengan `response_format: { type: "json_object" }`. Parser memvalidasi field dan jatuh ke default jika model menyimpang dari skema.

## Penanganan error

API route mengembalikan kode error spesifik:

| Kode | Arti |
|---|---|
| `INVALID_URL` | URL bukan http/https valid |
| `TIMEOUT` | Halaman tidak selesai loading |
| `AUTH_REQUIRED` | Halaman terlihat butuh login (aktifkan opsi "Login dulu") |
| `LOGIN_FORM_NOT_FOUND` | Tidak ketemu field username/password di halaman login (pakai selector kustom) |
| `LOGIN_FAILED` | Submit login tidak meredirect ke halaman terotentikasi (cek kredensial) |
| `EMPTY_PAGE` | Tidak ada elemen interaktif |
| `MISSING_KEY` | `DEEPSEEK_API_KEY` belum di-set |
| `API_ERROR` | DeepSeek mengembalikan non-2xx |
| `PARSE_ERROR` | Respons DeepSeek bukan JSON valid |

Frontend menampilkan pesan dari field `error` di response.

## Mode Login (test halaman dashboard)

Aktifkan checkbox **Login dulu sebelum crawl**, lalu isi:

- **URL halaman target** — URL dashboard / halaman setelah login (contoh `https://app.example.com/dashboard`).
- **URL halaman login** — contoh `https://app.example.com/login`.
- **Username/Email** dan **Password** — dipakai sekali untuk session Playwright.

Crawler akan:
1. Navigate ke login URL
2. Auto-detect field username (priority: `input[type=email]`, lalu nama umum: `email`/`user`/`login`) dan password (`input[type=password]`)
3. Submit form (klik tombol submit, atau press Enter di field password)
4. Verifikasi login: URL berubah dan field password hilang
5. Navigate ke URL dashboard, extract element, generate test case

Kalau site punya form login non-standar (modal, custom component, multi-step), pakai **Selector kustom** untuk override:

| Field | Contoh selector |
|---|---|
| Username | `#email`, `input[name="user_email"]`, `[data-testid="email-input"]` |
| Password | `#password`, `input[data-test="pwd"]` |
| Submit button | `button[type="submit"]`, `button:has-text("Sign in")` |

Saat mode login aktif, prompt DeepSeek otomatis menambahkan test case spesifik post-login: logout flow, session timeout, akses URL tanpa login (harus redirect), CRUD entry points di dashboard, dst.

### Keamanan kredensial

- Kredensial **tidak pernah** disimpan ke Supabase. Hanya `loginUrl` yang dicatat di `element_summary.login_url`.
- Kredensial dikirim dari browser ke API route (HTTPS-only di production) lalu diteruskan ke Playwright dalam memory.
- Tetap pakai akun **test/staging** milik kamu sendiri. Jangan input akun produksi orang lain.

## Auto-CRUD (eksperimental)

Aktifkan toggle **Auto-execute CRUD (eksperimental)** di form untuk menjalankan siklus CRUD penuh secara otomatis pada halaman target:

1. **Create** — cari tombol Create/Add/Tambah, isi form dengan data dummy (`Auto Test <id>`), klik Save, verifikasi baris baru muncul
2. **Read** — klik View/Detail di baris yang baru dibuat, pastikan modal/halaman detail terbuka
3. **Update** — klik Edit di baris itu, ubah field pertama jadi `... (edited)`, simpan, verifikasi
4. **Delete** — klik Delete di baris itu, klik tombol konfirmasi, verifikasi baris hilang (sekaligus cleanup)

Hasilnya ditampilkan sebagai **execution log** di hasil + di history detail, dengan status per step (✓/✗/−), durasi, dan path screenshot. Test case yang di-generate DeepSeek akan reference hasil eksekusi sebagai ground truth.

### Pengaman

- Hanya Update/Delete pada **baris yang dibuat oleh test ini** (matched by unique identifier) — data existing tidak disentuh
- Read pakai baris mana saja (non-destructive)
- Total budget ~45 detik. Total request bisa sampai 90 detik dengan login + DeepSeek
- Wajib tick checkbox konfirmasi sebelum Generate

### ⚠️ Risiko

- **Membuat data nyata** di target site. Cuma boleh di staging/test milik kamu sendiri.
- Kalau Delete gagal (mis. tombol confirm tidak ditemukan), ada sampah row yang harus dihapus manual.
- Form yang butuh data realistik (KTP valid, email yang belum dipakai, dropdown wajib, file upload) bisa fail validasi.

## Watch the test flow live

Tiga cara untuk lihat alur test secara visual, kontrol via env var di `.env.local`:

### 1. Headed mode — buka browser asli

```bash
CRAWLER_HEADLESS=false
```

Restart dev server (`Ctrl+C`, `npm run dev`), lalu Generate. Sebuah window Chromium akan terbuka dan kamu bisa nonton Playwright klik/ketik secara real-time.

### 2. Slow motion — kasih jeda antar action

```bash
CRAWLER_HEADLESS=false
CRAWLER_SLOWMO_MS=400
```

Setiap action Playwright (click/fill/press) akan dijeda 400ms. Cocok untuk MENGIKUTI mata terutama saat auto-CRUD jalan cepat.

### 3. Playwright Trace — replay setelah selesai

```bash
CRAWLER_TRACE=true
```

Setiap run akan menghasilkan `trace.zip` yang merekam timeline lengkap: screenshot per step, DOM snapshot, network log, console output, sumber action. Path file ditampilkan di hasil UI:

```bash
npx playwright show-trace /var/folders/.../autotc-trace-1234567890.zip
```

Trace Viewer adalah **cara paling powerful** untuk debug — kamu bisa scrub timeline, lihat persis apa yang Playwright klik di tiap moment, dan inspect DOM seperti DevTools. Bisa juga di-share ke teman.

Kombinasi rekomendasi: `CRAWLER_HEADLESS=true + CRAWLER_TRACE=true` di production-ish, `CRAWLER_HEADLESS=false + CRAWLER_SLOWMO_MS=400` saat debug aktif.

## Folder failed-runs

Setiap kali generate gagal, detail-nya otomatis disimpan ke `failed-runs/<timestamp>-<id>/` di root project. Folder ini berisi:

| File | Isi |
|---|---|
| `info.json` | Request metadata (URL, used_login, auto_crud, login selector kustom kalau ada — **tanpa kredensial**) + error code/message + durasi |
| `error.log` | Pesan error lengkap + stack trace |
| `screenshot.png` | Screenshot pas error terjadi (bila crawler sempat ngambil) |
| `trace.zip` | Playwright trace (kalau `CRAWLER_TRACE=true`) — replay dengan `npx playwright show-trace` |

Path folder ditampilkan di kotak error UI. Folder ini di-`.gitignore` jadi nggak ke-commit.

Override lokasi via env var:
```bash
FAILED_RUNS_DIR=/some/other/path
```

Catatan: kredensial **tidak pernah** disimpan ke `info.json` — hanya flag `used_login` + `login_url` (URL halaman login, bukan password).

## Catatan deployment (PENTING)

Playwright butuh Chromium binary. Ini **tidak jalan apa adanya** di Vercel default function (size limit + binary tidak tersedia). Pilihan arsitektur:

### Opsi A — Hybrid (rekomendasi)

- Frontend + halaman + `/api/export` di **Vercel**.
- API crawler `/api/generate` dipisah ke **Railway / Render / Fly.io** sebagai service Node.js (dengan Playwright + Chromium pre-installed pakai image `mcr.microsoft.com/playwright:v1.48.0-jammy`).
- Set env `NEXT_PUBLIC_GENERATE_URL` dan ubah `fetch("/api/generate")` di `GenerateForm` menjadi URL service tersebut. (Tidak dilakukan default agar lokal tetap simple.)

### Opsi B — Semua di Vercel dengan `@sparticuz/chromium`

- Tambah dependency: `npm i @sparticuz/chromium playwright-core`.
- Ganti import di `lib/crawler.ts`:
  ```ts
  import chromium from "@sparticuz/chromium";
  import { chromium as playwright } from "playwright-core";
  // browser = await playwright.launch({
  //   args: chromium.args,
  //   executablePath: await chromium.executablePath(),
  //   headless: true,
  // });
  ```
- Set `maxDuration` route ke 60 (sudah default). Pastikan plan Vercel mendukung function size yang dibutuhkan (`@sparticuz/chromium` ~50MB, butuh Pro plan untuk 250MB function).

### Opsi C — Self-host (Docker)

Image dasar `mcr.microsoft.com/playwright:v1.48.0-jammy` sudah punya Chromium. Build Next.js standalone dan run via `node server.js`.

Dipilih default untuk pengembangan lokal: **Playwright biasa (Opsi C / lokal)**, tanpa adapter serverless. Saat akan deploy, putuskan opsi di atas sebelum menulis kode lain — adapter yang dipilih mempengaruhi `lib/crawler.ts`.

## Batasan scope (MVP)

- Hanya 1 halaman per request, bukan multi-page crawl.
- Tidak ada autentikasi user untuk tool ini sendiri; semua history publik untuk siapa pun yang punya service-role key.
- Login flow ke target site mendukung form login standar (1 step, field email/password). Site dengan CAPTCHA, 2FA, OAuth/SSO popup, atau wizard multi-step belum didukung.
