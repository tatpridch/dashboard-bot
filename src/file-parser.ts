import * as XLSX from "xlsx";

export interface ParsedFile {
  name: string;
  type: string;
  preview: string;
  rowCount: number;
}

export async function parseFile(file: { name: string; buffer: Buffer }): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (["xlsx", "xls", "xlsb", "ods"].includes(ext)) {
    return parseSpreadsheet(file);
  }

  const text = file.buffer.toString("utf-8");

  if (ext === "html" || ext === "htm") {
    return { name: file.name, type: "html", preview: extractTablesFromHtml(text), rowCount: countRows(text) };
  }

  if (ext === "json" || ext === "jsonl") {
    return { name: file.name, type: "json", preview: truncate(text, 4000), rowCount: countJsonRows(text) };
  }

  if (ext === "csv") {
    return { name: file.name, type: "csv", preview: truncate(text, 4000), rowCount: text.trim().split("\n").length - 1 };
  }

  if (ext === "tsv") {
    return { name: file.name, type: "tsv", preview: truncate(text, 4000), rowCount: text.trim().split("\n").length - 1 };
  }

  const detected = detectFormat(text);
  return { name: file.name, type: detected, preview: truncate(text, 4000), rowCount: text.trim().split("\n").length };
}

function parseSpreadsheet(file: { name: string; buffer: Buffer }): ParsedFile {
  const wb = XLSX.read(file.buffer, { type: "buffer" });

  const sheets: string[] = [];
  let totalRows = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const rows = csv.trim().split("\n").length - 1;
    totalRows += rows;

    if (wb.SheetNames.length > 1) {
      sheets.push(`--- Sheet: ${sheetName} (${rows} rows) ---\n${csv}`);
    } else {
      sheets.push(csv);
    }
  }

  return {
    name: file.name,
    type: "spreadsheet",
    preview: truncate(sheets.join("\n\n"), 4000),
    rowCount: totalRows,
  };
}

function extractTablesFromHtml(html: string): string {
  // Regex-based table extraction (no DOMParser in Node)
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tables = [...html.matchAll(tableRegex)];

  if (tables.length === 0) {
    // Strip tags, return text
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return truncate(text, 4000);
  }

  const results: string[] = [];
  tables.forEach((match, i) => {
    const tableHtml = match[1];
    const rows: string[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    for (const rowMatch of tableHtml.matchAll(rowRegex)) {
      const cells: string[] = [];
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      for (const cellMatch of rowMatch[1].matchAll(cellRegex)) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
      }
      rows.push(cells.join("\t"));
    }
    results.push(`Table ${i + 1}:\n${rows.join("\n")}`);
  });

  return truncate(results.join("\n\n"), 4000);
}

function detectFormat(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  if (firstLine.includes("\t")) return "tsv";
  if (firstLine.split(",").length > 2) return "csv";
  if (text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) return "json";
  return "text";
}

function countRows(html: string): number {
  return (html.match(/<tr/gi) || []).length;
}

function countJsonRows(text: string): number {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.length;
    return Object.keys(parsed).length;
  } catch {
    return text.trim().split("\n").length;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... (truncated, ${text.length} chars total)`;
}

export function buildAnalysisPrompt(files: ParsedFile[], customPrompt?: string): string {
  const parts = files.map((f) => {
    return `File: ${f.name} (${f.type}, ~${f.rowCount} rows)\n\`\`\`\n${f.preview}\n\`\`\``;
  });

  const base = `Analyze this data and create a dashboard:\n\n${parts.join("\n\n")}`;
  const custom = customPrompt ? `\n\nUser's additional instructions: ${customPrompt}` : "";

  return `${base}${custom}\n\nExtract key metrics, identify trends, choose the best chart types, and tell the story this data reveals. Return a JSON object matching the AnalysisMeta schema.`;
}
