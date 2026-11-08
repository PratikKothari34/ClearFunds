// Bank statement CSVs (contracts/api/v1.md, "Bank statements"). This only
// reads the file into credit lines; amounts stay decimal text, and the
// database turns them into minor units by exact arithmetic.

export const STATEMENT_MAX_BYTES = 2 * 1024 * 1024;
export const STATEMENT_MAX_ROWS = 5000;

export class StatementError extends Error {}

export type Columns = { date: string; credit: string; reference?: string; narration?: string };
export type Line = { row: number; date: string; amount: string; reference: string | null; narration: string | null };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", "DD/MM/YY", "DD-Mon-YYYY"];

// RFC 4180 fields: quoted fields may hold commas, newlines and "" for a quote.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// To ISO YYYY-MM-DD, or null when the text does not read in the format.
export function readDate(s: string, format: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number, r: RegExpMatchArray | null;
  if (format === "YYYY-MM-DD" && (r = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if (format === "DD/MM/YYYY" && (r = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if (format === "DD-MM-YYYY" && (r = t.match(/^(\d{2})-(\d{2})-(\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if (format === "DD/MM/YY" && (r = t.match(/^(\d{2})\/(\d{2})\/(\d{2})$/))) [d, m, y] = [+r[1], +r[2], 2000 + +r[3]];
  else if (format === "DD-Mon-YYYY" && (r = t.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/))) {
    [d, m, y] = [+r[1], MONTHS.indexOf(r[2].toLowerCase()) + 1, +r[3]];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

// Decimal text, commas and spaces ignored; "" when the cell is empty or zero.
export function readAmount(s: string): string | null {
  const t = s.replace(/[,\s]/g, "");
  if (t === "") return "";
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return /^0*(\.0*)?$/.test(t) ? "" : t;
}

export function statementLines(csv: string, columns: Columns, format: string): { lines: Line[]; skipped: number } {
  if (new TextEncoder().encode(csv).length > STATEMENT_MAX_BYTES) throw new StatementError("A statement must be at most 2 MB.");
  if (!DATE_FORMATS.includes(format)) throw new StatementError(`Choose a date format: ${DATE_FORMATS.join(", ")}.`);
  const rows = parseCsv(csv.replace(/^﻿/, ""));
  if (rows.length - 1 > STATEMENT_MAX_ROWS) throw new StatementError("A statement must be at most 5,000 rows.");
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string | undefined, label: string) => {
    if (name === undefined || name === null || name === "") return -1;
    const i = header.indexOf(String(name).trim().toLowerCase());
    if (i < 0) throw new StatementError(`The file has no "${name}" column for the ${label}.`);
    return i;
  };
  const di = col(columns?.date, "date"), ci = col(columns?.credit, "credit");
  if (di < 0 || ci < 0) throw new StatementError("Name the date and credit columns.");
  const ri = col(columns.reference, "reference"), ni = col(columns.narration, "narration");
  const lines: Line[] = [];
  let skipped = 0;
  rows.slice(1).forEach((r, k) => {
    const row = k + 2; // as a spreadsheet numbers it, header included
    const amount = readAmount(r[ci] ?? "");
    if (amount === null) throw new StatementError(`Row ${row}: "${r[ci]}" is not an amount.`);
    if (amount === "") { skipped++; return; }
    const date = readDate(r[di] ?? "", format);
    if (!date) throw new StatementError(`Row ${row}: "${r[di]}" is not a ${format} date.`);
    const text = (i: number) => (i < 0 ? null : (r[i] ?? "").trim().slice(0, 500) || null);
    lines.push({ row, date, amount, reference: text(ri), narration: text(ni) });
  });
  if (!lines.length) throw new StatementError("The file has no credit lines.");
  return { lines, skipped };
}
