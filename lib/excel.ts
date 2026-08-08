import ExcelJS from "exceljs";
import type { TestCase } from "./supabase";

export async function buildTestCaseWorkbook(opts: {
  url: string;
  pageTitle: string | null;
  cases: TestCase[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AutoTestCase Generator";
  wb.created = new Date();

  const ws = wb.addWorksheet("Test Cases", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "Test ID", key: "test_id", width: 12 },
    { header: "Test Case Name", key: "test_case_name", width: 40 },
    { header: "Precondition", key: "precondition", width: 35 },
    { header: "Test Steps", key: "test_steps", width: 50 },
    { header: "Expected Result", key: "expected_result", width: 40 },
    { header: "Actual Result", key: "actual_result", width: 40 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Category", key: "category", width: 18 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" },
  };

  for (const tc of opts.cases) {
    ws.addRow({
      test_id: tc.test_id,
      test_case_name: tc.test_case_name,
      precondition: tc.precondition,
      test_steps: tc.test_steps.join("\n"),
      expected_result: tc.expected_result,
      actual_result: tc.actual_result ?? "",
      priority: tc.priority,
      category: tc.category,
    });
  }

  ws.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });

  // Metadata sheet
  const meta = wb.addWorksheet("Meta");
  meta.columns = [
    { header: "Field", key: "k", width: 20 },
    { header: "Value", key: "v", width: 80 },
  ];
  meta.addRow({ k: "URL", v: opts.url });
  meta.addRow({ k: "Page Title", v: opts.pageTitle ?? "" });
  meta.addRow({ k: "Generated At", v: new Date().toISOString() });
  meta.addRow({ k: "Total Test Cases", v: opts.cases.length });
  meta.getRow(1).font = { bold: true };

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
