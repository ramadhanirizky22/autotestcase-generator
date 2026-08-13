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

  // --- SHEET 1: Test Cases ---
  const ws = wb.addWorksheet("Test Cases", {
    views: [{ showGridLines: true, state: "frozen", ySplit: 7 }],
  });

  // Calculate statistics
  const totalCases = opts.cases.length;
  const highCases = opts.cases.filter((c) => c.priority === "High").length;
  const mediumCases = opts.cases.filter((c) => c.priority === "Medium").length;
  const lowCases = opts.cases.filter((c) => c.priority === "Low").length;

  // Set column widths
  ws.columns = [
    { key: "test_id", width: 14 },
    { key: "test_case_name", width: 38 },
    { key: "precondition", width: 34 },
    { key: "test_steps", width: 50 },
    { key: "expected_result", width: 38 },
    { key: "actual_result", width: 38 },
    { key: "priority", width: 16 },
    { key: "category", width: 22 },
  ];

  // --- ROW 1: Title Banner ---
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "  TEST CASE SPECIFICATION REPORT";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" }, // Slate 900
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 36;

  // --- ROW 2 & 3: Metadata Info Bar ---
  ws.mergeCells("A2:H2");
  const metaCell1 = ws.getCell("A2");
  metaCell1.value = `  Target Page: ${opts.pageTitle ? `${opts.pageTitle} (${opts.url})` : opts.url}`;
  metaCell1.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: "FF334155" } };
  metaCell1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  metaCell1.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(2).height = 22;

  ws.mergeCells("A3:H3");
  const metaCell2 = ws.getCell("A3");
  metaCell2.value = `  Generated: ${new Date().toLocaleString("id-ID")}  |  Total Test Cases: ${totalCases}`;
  metaCell2.font = { name: "Segoe UI", size: 9, color: { argb: "FF64748B" } };
  metaCell2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  metaCell2.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(3).height = 20;

  // --- ROW 4: Spacer ---
  ws.getRow(4).height = 10;

  // --- ROW 5: KPI Summary Badges ---
  ws.mergeCells("A5:B5");
  const kpiTotal = ws.getCell("A5");
  kpiTotal.value = `Total Cases: ${totalCases}`;
  kpiTotal.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF0F172A" } };
  kpiTotal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  kpiTotal.alignment = { vertical: "middle", horizontal: "center" };
  kpiTotal.border = {
    top: { style: "thin", color: { argb: "FFCBD5E1" } },
    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    left: { style: "thin", color: { argb: "FFCBD5E1" } },
    right: { style: "thin", color: { argb: "FFCBD5E1" } },
  };

  ws.mergeCells("C5:D5");
  const kpiHigh = ws.getCell("C5");
  kpiHigh.value = `High Priority: ${highCases}`;
  kpiHigh.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF991B1B" } };
  kpiHigh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
  kpiHigh.alignment = { vertical: "middle", horizontal: "center" };
  kpiHigh.border = {
    top: { style: "thin", color: { argb: "FFFCA5A5" } },
    bottom: { style: "thin", color: { argb: "FFFCA5A5" } },
    left: { style: "thin", color: { argb: "FFFCA5A5" } },
    right: { style: "thin", color: { argb: "FFFCA5A5" } },
  };

  ws.mergeCells("E5:F5");
  const kpiMed = ws.getCell("E5");
  kpiMed.value = `Medium Priority: ${mediumCases}`;
  kpiMed.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF92400E" } };
  kpiMed.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  kpiMed.alignment = { vertical: "middle", horizontal: "center" };
  kpiMed.border = {
    top: { style: "thin", color: { argb: "FFFDE68A" } },
    bottom: { style: "thin", color: { argb: "FFFDE68A" } },
    left: { style: "thin", color: { argb: "FFFDE68A" } },
    right: { style: "thin", color: { argb: "FFFDE68A" } },
  };

  ws.mergeCells("G5:H5");
  const kpiLow = ws.getCell("G5");
  kpiLow.value = `Low Priority: ${lowCases}`;
  kpiLow.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF065F46" } };
  kpiLow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  kpiLow.alignment = { vertical: "middle", horizontal: "center" };
  kpiLow.border = {
    top: { style: "thin", color: { argb: "FFA7F3D0" } },
    bottom: { style: "thin", color: { argb: "FFA7F3D0" } },
    left: { style: "thin", color: { argb: "FFA7F3D0" } },
    right: { style: "thin", color: { argb: "FFA7F3D0" } },
  };
  ws.getRow(5).height = 26;

  // --- ROW 6: Spacer ---
  ws.getRow(6).height = 12;

  // --- ROW 7: Table Headers ---
  const headerTitles = [
    "Test ID",
    "Test Case Name",
    "Precondition",
    "Test Steps",
    "Expected Result",
    "Actual Result",
    "Priority",
    "Category",
  ];

  const headerRow = ws.getRow(7);
  headerTitles.forEach((title, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = title;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.alignment = { vertical: "middle", horizontal: idx === 0 || idx >= 6 ? "center" : "left" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF0F172A" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });
  headerRow.height = 28;

  // --- DATA ROWS (Starting Row 8) ---
  opts.cases.forEach((tc, idx) => {
    const rowNum = 8 + idx;
    const row = ws.getRow(rowNum);

    const isEven = idx % 2 === 0;
    const bgHex = isEven ? "FFFFFFFF" : "FFF8FAFC"; // Zebra striping

    const stepsStr = Array.isArray(tc.test_steps) ? tc.test_steps.join("\n") : String(tc.test_steps || "");

    row.getCell(1).value = tc.test_id;
    row.getCell(2).value = tc.test_case_name;
    row.getCell(3).value = tc.precondition;
    row.getCell(4).value = stepsStr;
    row.getCell(5).value = tc.expected_result;
    row.getCell(6).value = tc.actual_result ?? "";
    row.getCell(7).value = tc.priority;
    row.getCell(8).value = tc.category;

    // Apply base cell styles
    for (let col = 1; col <= 8; col++) {
      const cell = row.getCell(col);
      cell.font = { name: "Segoe UI", size: 9.5, color: { argb: "FF1E293B" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgHex } };
      cell.alignment = {
        vertical: "top",
        wrapText: true,
        horizontal: col === 1 || col >= 7 ? "center" : "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    }

    // Custom formatting for Test ID (bold monospace)
    row.getCell(1).font = { name: "Consolas", size: 9.5, bold: true, color: { argb: "FF334155" } };

    // Custom formatting for Test Case Name (bold)
    row.getCell(2).font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };

    // Custom badge styling for Priority
    const priorityCell = row.getCell(7);
    if (tc.priority === "High") {
      priorityCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      priorityCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF991B1B" } };
    } else if (tc.priority === "Medium") {
      priorityCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      priorityCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF92400E" } };
    } else if (tc.priority === "Low") {
      priorityCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
      priorityCell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF065F46" } };
    }

    // Custom badge styling for Category
    const categoryCell = row.getCell(8);
    categoryCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
    categoryCell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF3730A3" } };
  });

  // --- SHEET 2: Summary & Meta ---
  const metaWs = wb.addWorksheet("Summary & Meta");
  metaWs.views = [{ showGridLines: true }];
  metaWs.columns = [
    { key: "k", width: 24 },
    { key: "v", width: 70 },
  ];

  metaWs.mergeCells("A1:B1");
  const metaTitle = metaWs.getCell("A1");
  metaTitle.value = "  GENERATION SUMMARY";
  metaTitle.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  metaTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  metaTitle.alignment = { vertical: "middle", horizontal: "left" };
  metaWs.getRow(1).height = 30;

  const metaData = [
    { k: "Target Page Title", v: opts.pageTitle ?? "(tanpa judul)" },
    { k: "Target URL", v: opts.url },
    { k: "Export Date", v: new Date().toLocaleString("id-ID") },
    { k: "Total Test Cases", v: totalCases },
    { k: "High Priority", v: highCases },
    { k: "Medium Priority", v: mediumCases },
    { k: "Low Priority", v: lowCases },
    { k: "Generator Tool", v: "AutoTestCase Generator (Next.js + Playwright + DeepSeek)" },
  ];

  metaData.forEach((row, i) => {
    const rowNum = i + 3;
    const r = metaWs.getRow(rowNum);
    r.getCell(1).value = row.k;
    r.getCell(2).value = row.v;
    r.getCell(1).font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF334155" } };
    r.getCell(2).font = { name: "Segoe UI", size: 10, color: { argb: "FF0F172A" } };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    r.getCell(1).border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    r.getCell(2).border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

