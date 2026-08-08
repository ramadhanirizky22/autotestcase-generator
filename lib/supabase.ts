import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client.
 *
 * Uses the service-role key, so this MUST only be imported from server
 * components or API routes. Never bundle this into client code.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export type TestRunRow = {
  id: string;
  url: string;
  page_title: string | null;
  created_at: string;
  raw_result: { test_cases: TestCase[] };
  element_summary: ElementSummary | null;
};

export type TestCase = {
  test_id: string;
  test_case_name: string;
  precondition: string;
  test_steps: string[];
  expected_result: string;
  /**
   * Diisi tester ketika menjalankan test case. Default kosong saat
   * generate. Bisa di-edit inline di halaman hasil sebelum di-save.
   */
  actual_result?: string;
  priority: "High" | "Medium" | "Low";
  category: "Functional" | "Validation" | "UI" | "Negative Test";
};

export type CrudExecutionLog = {
  enabled: true;
  uniqueId: string;
  identifier: string | null;
  steps: Array<{
    operation: "create" | "read" | "update" | "delete";
    status: "success" | "failed" | "skipped";
    title: string;
    details: string;
    error?: string;
    screenshotPath?: string;
    durationMs: number;
  }>;
};

export type ElementSummary = {
  forms: number;
  inputs: number;
  buttons: number;
  links: number;
  headings: number;
  tables?: number;
  crud?: {
    create: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
    search: boolean;
    filter: boolean;
    export: boolean;
    pagination: boolean;
    modal: boolean;
  };
};
