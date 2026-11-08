// deno test -A supabase/functions/api/statements.test.ts
import { parseCsv, readAmount, readDate, StatementError, statementLines } from "./statements.ts";

const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\n  have: ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
};
const refuses = (f: () => unknown, part: string) => {
  try { f(); } catch (e) {
    if (e instanceof StatementError && e.message.includes(part)) return;
    throw new Error(`refused with "${(e as Error).message}", expected "${part}"`);
  }
  throw new Error(`not refused; expected "${part}"`);
};

const cols = { date: "Value Date", credit: "Deposit Amt.", reference: "Chq./Ref.No.", narration: "Narration" };

Deno.test("quoted fields keep commas, newlines and doubled quotes; CRLF and blank lines are fine", () => {
  eq(parseCsv('a,b\r\n"1,2","say ""hi""\nthere"\r\n\r\n3,4'), [["a", "b"], ["1,2", 'say "hi"\nthere'], ["3", "4"]], "rows");
});

Deno.test("dates read only in the named format, and impossible dates are refused", () => {
  eq(readDate("27/10/2026", "DD/MM/YYYY"), "2026-10-27", "DD/MM/YYYY");
  eq(readDate("05-Oct-2026", "DD-Mon-YYYY"), "2026-10-05", "DD-Mon-YYYY");
  eq(readDate("27/10/26", "DD/MM/YY"), "2026-10-27", "DD/MM/YY is 20YY");
  eq(readDate("2026-10-27", "DD/MM/YYYY"), null, "another format is not guessed");
  eq(readDate("31/02/2026", "DD/MM/YYYY"), null, "31 February does not exist");
});

Deno.test("amounts stay decimal text: grouping removed, empty or zero means a debit", () => {
  eq(readAmount("1,25,075.50"), "125075.50", "Indian grouping");
  eq(readAmount(" 0.00 "), "", "zero is no credit");
  eq(readAmount(""), "", "empty is no credit");
  eq(readAmount("12.505"), "12.505", "a fine fraction passes through for the database to refuse");
  eq(readAmount("-50"), null, "a sign is not an amount");
  eq(readAmount("₹50"), null, "nor is a currency symbol");
});

Deno.test("a bank's layout: credits kept with their row, debits skipped, header matched ignoring case", () => {
  const csv = [
    "Date,Narration,Chq./Ref.No.,Value Date,Withdrawal Amt.,Deposit Amt.",
    '27/10/26,"UPI/412345678901/A-1, maintenance",412345678901,27/10/2026,,"12,500.75"',
    "27/10/26,LIFT AMC,000123,27/10/2026,5000.00,",
    "28/10/26,NEFT R2,HDFCN520261027,28/10/2026,,5000",
  ].join("\n");
  const { lines, skipped } = statementLines(csv, { ...cols, date: "value date" }, "DD/MM/YYYY");
  eq(skipped, 1, "the withdrawal is skipped");
  eq(lines.map((l) => [l.row, l.date, l.amount, l.reference]),
     [[2, "2026-10-27", "12500.75", "412345678901"], [4, "2026-10-28", "5000", "HDFCN520261027"]], "credits with spreadsheet rows");
  eq(lines[0].narration, "UPI/412345678901/A-1, maintenance", "the narration keeps its comma");
});

Deno.test("refusals name what is wrong and where", () => {
  const head = "Value Date,Deposit Amt.,Chq./Ref.No.,Narration";
  refuses(() => statementLines(head + "\n27/10/2026,100,x,y", cols, "MM/DD/YYYY"), "Choose a date format");
  refuses(() => statementLines("Date,Amount\n27/10/2026,100", cols, "DD/MM/YYYY"), 'no "Value Date" column');
  refuses(() => statementLines(head + "\n27/10/2026,ten,x,y", cols, "DD/MM/YYYY"), 'Row 2: "ten" is not an amount');
  refuses(() => statementLines(head + "\n27/10/2026,100,x,y\n2026-10-28,5,x,y", cols, "DD/MM/YYYY"), "Row 3");
  refuses(() => statementLines(head + "\n27/10/2026,,x,y", cols, "DD/MM/YYYY"), "no credit lines");
  refuses(() => statementLines(head + "\n" + "27/10/2026,1,x,y\n".repeat(5001), cols, "DD/MM/YYYY"), "5,000 rows");
  refuses(() => statementLines("x".repeat(2 * 1024 * 1024 + 1), cols, "DD/MM/YYYY"), "2 MB");
});
