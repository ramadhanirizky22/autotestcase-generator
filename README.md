# 🚀 AutoTestCase Generator

> **AI-Powered Automated QA Test Case Generator & Executable Suite Builder**

AutoTestCase Generator adalah platform QA modern berbasis **Next.js 14, Playwright, DeepSeek LLM, dan Supabase**. Aplikasi ini secara otomatis melakukan *crawling* DOM pada web target, mengidentifikasi elemen interaktif (form, tombol, link, tabel, indikator CRUD), mengeksekusi alur tes otomatis (Auto-CRUD), dan menyusun daftar test case QA profesional siap pakai yang dapat di-export ke Excel secara instan.

---

## 📌 GitHub Repository Description & Topics

Gunakan informasi ini saat mengisi bagian **About** pada halaman repository GitHub:

* **Short Description / Tagline**:
  > ⚡ AI-powered QA tool that automatically crawls web pages with Playwright, executes Auto-CRUD workflows, and generates comprehensive manual test cases using DeepSeek LLM. Includes Executive Excel Export & Supabase history tracking.

* **Topics / Tags**:
  `nextjs14` `playwright` `deepseek-ai` `qa-automation` `testcase-generator` `typescript` `supabase` `exceljs` `software-testing` `web-crawler`

---

## ✨ Fitur Utama

- 🔍 **Automated DOM Web Crawler**: Mengidentifikasi form, input, button, link navigasi, headings, dan tabel data secara presisi dengan Playwright.
- 🧠 **AI Test Generation (DeepSeek LLM)**: Menghasilkan 15–40 test case QA terstruktur (Functional, Validation, UI, & Negative Testing) dalam Bahasa Indonesia 🇮🇩 atau English 🇬🇧.
- ⚡ **Auto-CRUD Execution Engine**: Menjalankan siklus otomatis *Create → Read → Update → Delete* secara *live* pada website target sebagai *ground truth* verifikasi.
- 🔐 **Authenticated Dashboard Crawling**: Mendukung *login flow* otomatis & selector kustom untuk meng-crawl halaman internal/dashboard di balik tembok otentikasi.
- 🌐 **Multi-Page Crawling Mode**: Melakukan crawling hingga 10 halaman *same-origin* dalam satu sesi test suite.
- 📊 **Executive Excel Export (`.xlsx`)**: Menghasilkan file Excel berdesain *executive-grade* lengkap dengan KPI summary badges, zebra striping, dan frozen header.
- 🌐 **Live Translation (ID ↔ EN)**: Mengubah bahasa seluruh test case hanya dengan 1-klik tanpa kehilangan metadata ID atau kategori.
- 🔍 **Playwright Trace & Failure Diagnostics**: Otomatis merekam *timeline trace zip*, screenshot failure, dan menyimpan *raw LLM response* untuk kemudahan debugging.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, Server Actions & API Routes)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Browser Automation**: [Playwright](https://playwright.dev/) (Chromium)
- **AI Model**: [DeepSeek Chat API](https://platform.deepseek.com/) (`deepseek-chat`)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL & Row Level Security)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Reporting**: [ExcelJS](https://github.com/exceljs/exceljs)

---

## 📐 Alur Kerja Sistem

```
 ┌────────────────┐     ┌──────────────────────┐     ┌────────────────────────┐
 │   User Input   │ ──> │ Playwright Engine    │ ──> │   Element Scraper      │
 │  (URL / Auth)  │     │ (Headless Chromium)  │     │ (Forms, Buttons, Nav)  │
 └────────────────┘     └──────────────────────┘     └────────────────────────┘
                                                                 │
 ┌────────────────┐     ┌──────────────────────┐                 │
 │ Executive Excel│ <── │ DeepSeek LLM API     │ <───────────────┘
 │ & Supabase DB  │     │ (JSON Test Cases)    │
 └────────────────┘     └──────────────────────┘
```

---

## 🚀 Quick Start (Lokal)

### 1. Prasyarat
- Node.js `v18.x` atau `v20.x` / `v22.x`
- NPM / PNPM / YARN

### 2. Instalasi & Setup

```bash
# Clone repository
git clone https://github.com/ramadhanirizky22/autotestcase-generator.git
cd autotestcase-generator

# Install dependencies (+ Playwright Chromium)
npm install

# Salin contoh environment
cp .env.example .env.local
```

### 3. Konfigurasi Environment (`.env.local`)

Isi file `.env.local` dengan kredensial API kamu:

```env
# DeepSeek API
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# Supabase Storage
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Crawler Tuning (Opsional)
CRAWLER_TIMEOUT_MS=20000
CRAWLER_HEADLESS=true
CRAWLER_SLOWMO_MS=0
CRAWLER_TRACE=true
```

### 4. Setup Database Supabase

1. Buat proyek baru di [Supabase Dashboard](https://supabase.com).
2. Buka **SQL Editor** → Tempel isi dari file [`supabase/schema.sql`](./supabase/schema.sql) → Klik **Run**.
3. Ambil `Project URL` dan `service_role key` dari menu **Settings → API**.

### 5. Jalankan Server Dev

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser kamu.

---

## ⚙️ Environment Variables Reference

| Variable | Type | Default | Deskripsi |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | String | - | **Wajib**. API Key dari DeepSeek Platform |
| `DEEPSEEK_BASE_URL` | String | `https://api.deepseek.com` | Base URL endpoint DeepSeek API |
| `DEEPSEEK_MODEL` | String | `deepseek-chat` | Model DeepSeek yang digunakan |
| `NEXT_PUBLIC_SUPABASE_URL` | String | - | **Wajib**. URL Proyek Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | String | - | **Wajib**. Secret Service Role Key Supabase |
| `CRAWLER_TIMEOUT_MS` | Number | `20000` | Maksimal waktu tunggu Playwright (ms) |
| `CRAWLER_HEADLESS` | Boolean | `true` | `false` untuk melihat window Chromium asli secara live |
| `CRAWLER_SLOWMO_MS` | Number | `0` | Jeda waktu per aksi klik/fill (ms) saat debugging |
| `CRAWLER_TRACE` | Boolean | `true` | Merekam trace.zip Playwright per eksekusi |

---

## 📊 Format Output Test Case

Setiap test case di-generate dengan struktur JSON standar QA:

```json
{
  "test_id": "TC-001",
  "test_case_name": "Verifikasi Login dengan Kredensial Valid",
  "precondition": "Pengguna berada di halaman login dan memiliki akun aktif",
  "test_steps": [
    "1. Buka halaman https://example.com/login",
    "2. Masukkan email valid pada input Email",
    "3. Masukkan password valid pada input Password",
    "4. Klik tombol 'Sign In'"
  ],
  "expected_result": "Pengguna berhasil masuk dan diarahkan ke Dashboard",
  "actual_result": "",
  "priority": "High",
  "category": "Functional"
}
```

---

## 🎥 Monitoring & Debugging Playwright Live

Kamu bisa melihat cara kerja crawler secara langsung dengan mengaktifkan mode berikut di `.env.local`:

### 1. Headed Mode (Buka Browser Asli)
```bash
CRAWLER_HEADLESS=false
```

### 2. Slow Motion (Visualisasi Langkah)
```bash
CRAWLER_HEADLESS=false
CRAWLER_SLOWMO_MS=400
```

### 3. Replay dengan Playwright Trace Viewer
```bash
# Jalankan trace viewer dari path file yang dihasilkan di UI
npx playwright show-trace /path/to/trace.zip
```

---

## 📁 Folder Diagnostic `failed-runs/`

Apabila terjadi kesalahan saat crawling atau parsing LLM, sistem secara otomatis mengisolasi log ke dalam folder `failed-runs/<timestamp>-<id>/`:

- `info.json`: Metadata request & error code.
- `error.log`: Full stack trace error.
- `deepseek_response.txt`: Raw response dari LLM jika terjadi masalah parsing JSON.
- `screenshot.png`: Cuplikan tampilan halaman saat terjadi failure.
- `trace.zip`: Playwright trace timeline.

---

## 📦 Pilihan Deployment

- **Vercel + Railway / Render (Recommended)**: Deploy frontend di Vercel, dan pisahkan API crawler `/api/generate` ke Railway/Render menggunakan Docker image official Playwright (`mcr.microsoft.com/playwright:v1.48.0-jammy`).
- **Self-Hosted Docker**: Build Next.js standalone menggunakan Dockerfile Chromium.

---

## 📄 Lisensi

Project ini dilisensikan di bawah [MIT License](LICENSE).

---

<p align="center">
  Crafted with ❤️ by <a href="https://github.com/ramadhanirizky22">Ramadhani Rizky</a>
</p>
