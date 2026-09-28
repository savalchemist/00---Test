import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "./prisma";
import { cleanTags, normalizePhone, parseExtra, parseTags, serializeExtra, serializeTags } from "./participant";
import { ALIASES, mapRow, type FieldKey, type Mapping, type RawRow } from "./import-mapping";

type Field = FieldKey;

const norm = (h: string) => h.toLowerCase().replace(/[\s_\-.()/:]/g, "");

export function mapHeaders(headers: string[]): Partial<Record<Field, string>> {
  const mapping: Partial<Record<Field, string>> = {};
  for (const header of headers) {
    const key = norm(header);
    for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (!mapping[field] && aliases.includes(key)) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

export function parseFile(buffer: Buffer, filename: string): Record<string, unknown>[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const text = decodeText(buffer).replace(/^\uFEFF/, "");
    const res = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      delimiter: lower.endsWith(".tsv") ? "\t" : "",
    });
    return res.data;
  }
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
}

/** UTF-8 first; otherwise assume the Thai Windows code page (legacy Excel "CSV" exports). */
function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-874").decode(buffer);
  }
}

const str = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
};

const truthy = (v: unknown) => /^(y|yes|true|1|✓|✔|x|ใช่|ยินยอม|signed)$/i.test(str(v));

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

type ProfileData = {
  firstName?: string;
  lastName?: string;
  email?: string;
  lineId?: string;
  age?: number;
  gender?: string;
  occupation?: string;
  monthlyIncome?: string;
  province?: string;
  pdpaConsentSigned?: boolean;
  pdpaSignedDate?: Date | null;
  tags?: string;
};

export type ImportRowError = { row: number; message: string };
export type ImportResult = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
  warnings: ImportRowError[];
  mapping: Partial<Record<Field, string>>;
};

/**
 * Upsert every row keyed by normalized phone. Existing participants are updated silently;
 * blank cells never overwrite existing data, tags are merged, and status is never changed.
 */
export async function importRows(rows: Record<string, unknown>[]): Promise<ImportResult> {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const mapping = mapHeaders(headers);
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], warnings: [], mapping };

  if (!mapping.phone) {
    result.errors.push({ row: 0, message: "No phone column found. Expected a header like “Phone” or “เบอร์โทร”." });
    result.skipped = rows.length;
    return result;
  }

  const get = (row: Record<string, unknown>, f: Field) => (mapping[f] ? str(row[mapping[f]!]) : "");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // header is row 1 in the spreadsheet
    try {
      const phone = normalizePhone(get(row, "phone"));
      if (phone.length < 9) {
        if (Object.values(row).some((v) => str(v))) result.errors.push({ row: rowNo, message: "Missing or invalid phone number" });
        result.skipped++;
        continue;
      }

      let firstName = get(row, "firstName");
      let lastName = get(row, "lastName");
      const full = get(row, "fullName");
      if (!firstName && full) {
        const [f, ...rest] = full.split(/\s+/);
        firstName = f;
        lastName = lastName || rest.join(" ");
      }

      const ageRaw = get(row, "age");
      const age = ageRaw && !Number.isNaN(Number(ageRaw)) ? Math.round(Number(ageRaw)) : undefined;
      let email = get(row, "email").toLowerCase() || undefined;
      const incomingTags = cleanTags(get(row, "tags"));
      const pdpaRaw = mapping.pdpaConsentSigned ? row[mapping.pdpaConsentSigned] : undefined;
      const pdpaSigned = pdpaRaw !== undefined && str(pdpaRaw) !== "" ? truthy(pdpaRaw) : undefined;
      const pdpaDate = mapping.pdpaSignedDate ? toDate(row[mapping.pdpaSignedDate]) : null;

      const existing = await prisma.participant.findUnique({ where: { phone } });

      if (email) {
        const owner = await prisma.participant.findUnique({ where: { email }, select: { id: true } });
        if (owner && owner.id !== existing?.id) {
          result.warnings.push({ row: rowNo, message: `Email ${email} already belongs to another participant — email not saved` });
          email = undefined;
        }
      }

      // Only non-empty values are applied, so partial sheets never wipe existing data.
      const data: ProfileData = {};
      if (firstName) data.firstName = firstName;
      if (lastName) data.lastName = lastName;
      if (email) data.email = email;
      const lineId = get(row, "lineId");
      if (lineId) data.lineId = lineId;
      if (age !== undefined) data.age = age;
      for (const f of ["gender", "occupation", "monthlyIncome", "province"] as const) {
        const v = get(row, f);
        if (v) data[f] = v;
      }
      if (pdpaSigned !== undefined) {
        data.pdpaConsentSigned = pdpaSigned;
        data.pdpaSignedDate = pdpaSigned ? pdpaDate ?? existing?.pdpaSignedDate ?? new Date() : null;
      }

      if (existing) {
        if (incomingTags.length) data.tags = serializeTags([...parseTags(existing.tags), ...incomingTags]);
        await prisma.participant.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        if (!firstName) {
          result.errors.push({ row: rowNo, message: "New participant needs a name" });
          result.skipped++;
          continue;
        }
        await prisma.participant.create({
          data: {
            ...data,
            firstName,
            lastName: lastName || "",
            phone,
            tags: serializeTags(incomingTags),
          },
        });
        result.created++;
      }
    } catch (e) {
      result.errors.push({ row: rowNo, message: e instanceof Error ? e.message.split("\n").pop()! : "Unknown error" });
      result.skipped++;
    }
  }

  return result;
}

export const TEMPLATE_HEADERS = [
  "First Name",
  "Last Name",
  "Phone",
  "Email",
  "Line ID",
  "Age",
  "Gender",
  "Occupation",
  "Monthly Income",
  "Province",
  "Tags",
  "PDPA Consent",
  "PDPA Signed Date",
];

export function buildTemplate(): Buffer {
  const example = [
    ["Somchai", "Jaidee", "0812345678", "somchai@example.com", "somchai.j", 34, "Male", "SME Owner", "50,001 – 100,000", "Bangkok", "SME Owner, iPhone User", "Yes", "2026-01-15"],
    ["Suda", "Rakthai", "0898765432", "", "suda_r", 27, "Female", "Office worker", "15,000 – 30,000", "Chiang Mai", "Android User; Online Shopper", "No", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...example]);
  ws["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  // Force the phone column to text so Excel keeps the leading zero.
  for (let r = 1; r <= example.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    if (cell) cell.t = "s";
  }
  const notes = XLSX.utils.aoa_to_sheet([
    ["Column", "Notes"],
    ["Phone", "Required. Used to detect duplicates — existing phones are updated automatically."],
    ["First Name / Last Name", "Required for new participants. A single “Name” column is also accepted."],
    ["Tags", "Separate multiple tags with , ; or |"],
    ["PDPA Consent", "Yes / No"],
    ["Blank cells", "Blank cells never overwrite existing data on update."],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Participants");
  XLSX.utils.book_append_sheet(wb, notes, "Instructions");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ─── Review-first import (preview → review → commit) ────────────────────────

export const MAX_PREVIEW_ROWS = 2000;

/** Parsed sheet rows with every cell as a trimmed string (dates as YYYY-MM-DD). */
export function toRawRows(rows: Record<string, unknown>[]): { headers: string[]; rows: RawRow[] } {
  const headers: string[] = [];
  for (const row of rows) for (const h of Object.keys(row)) if (!headers.includes(h)) headers.push(h);
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
    return String(v).trim();
  };
  const out = rows
    .map((row) => Object.fromEntries(headers.map((h) => [h, cell(row[h])])))
    .filter((row) => Object.values(row).some(Boolean));
  return { headers, rows: out };
}

/**
 * Turn a Google Sheets share link into its CSV export URL. Only docs.google.com is ever
 * contacted, and only the ID/gid extracted from the link are used.
 */
export function googleSheetCsvUrl(link: string): string | null {
  const gid = link.match(/[#&?]gid=(\d+)/)?.[1];
  const published = link.match(/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (published) return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv${gid ? `&gid=${gid}` : ""}`;
  const id = link.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!id) return null;
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

export async function fetchGoogleSheet(link: string): Promise<{ name: string; buffer: Buffer }> {
  const url = googleSheetCsvUrl(link);
  if (!url) throw new Error("That doesn't look like a Google Sheets link (docs.google.com/spreadsheets/…).");
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("text/html")) {
    throw new Error(
      "Couldn't read this sheet. Share it as “Anyone with the link can view”, or use “Choose from Google Drive” for private sheets.",
    );
  }
  return { name: "Google Sheet.csv", buffer: Buffer.from(await res.arrayBuffer()) };
}

export type RowDecision = {
  index: number;
  status: "REAL" | "GEH";
  rating: number;
  reason?: "NO_SHOW" | "FAKE_PROFILE" | "INAPPROPRIATE_BEHAVIOR" | "OTHER";
  details?: string;
};

export type SessionInfo = { projectName: string; sessionDate: Date; interviewer: string };

export type CommitResult = {
  saved: number;
  created: number;
  updated: number;
  sessions: number;
  flagged: number;
  errors: ImportRowError[];
  warnings: ImportRowError[];
};

/**
 * Save reviewed rows. Same upsert rules as `importRows` (blank cells never overwrite,
 * tags and extra info merge), plus: the reviewer's flag sets the status, and each row
 * gets a research session carrying the reviewer's rating.
 */
export async function commitImport(
  rows: RawRow[],
  mapping: Mapping,
  decisions: RowDecision[],
  session: SessionInfo,
): Promise<CommitResult> {
  const result: CommitResult = { saved: 0, created: 0, updated: 0, sessions: 0, flagged: 0, errors: [], warnings: [] };

  for (const d of decisions) {
    const rowNo = d.index + 2; // spreadsheet row number (header is row 1)
    const raw = rows[d.index];
    if (!raw) {
      result.errors.push({ row: rowNo, message: "Row not found" });
      continue;
    }
    const rec = mapRow(raw, mapping);
    if (rec.errors.length) {
      result.errors.push({ row: rowNo, message: rec.errors.join("; ") });
      continue;
    }

    try {
      const existing = await prisma.participant.findUnique({ where: { phone: rec.phone } });
      if (!existing && !rec.firstName) {
        result.errors.push({ row: rowNo, message: "New participant needs a name" });
        continue;
      }
      const newFlag = d.status === "GEH" && existing?.status !== "GEH";
      if (newFlag && (!d.reason || !d.details || d.details.trim().length < 5)) {
        result.errors.push({ row: rowNo, message: "Flag as เก๊ needs a reason and details (min 5 characters)" });
        continue;
      }

      let email = rec.email || undefined;
      if (email) {
        const owner = await prisma.participant.findUnique({ where: { email }, select: { id: true } });
        if (owner && owner.id !== existing?.id) {
          result.warnings.push({ row: rowNo, message: `Email ${email} already belongs to another participant — email not saved` });
          email = undefined;
        }
      }

      const data: {
        firstName?: string; lastName?: string; email?: string; lineId?: string; age?: number;
        gender?: string; occupation?: string; monthlyIncome?: string; province?: string;
        pdpaConsentSigned?: boolean; pdpaSignedDate?: Date | null;
      } = {};
      if (rec.firstName) data.firstName = rec.firstName;
      if (rec.lastName) data.lastName = rec.lastName;
      if (email) data.email = email;
      if (rec.lineId) data.lineId = rec.lineId;
      if (rec.age !== undefined) data.age = rec.age;
      for (const f of ["gender", "occupation", "monthlyIncome", "province"] as const) if (rec[f]) data[f] = rec[f];
      if (rec.pdpaConsentSigned !== undefined) {
        data.pdpaConsentSigned = rec.pdpaConsentSigned;
        data.pdpaSignedDate = rec.pdpaConsentSigned ? rec.pdpaSignedDate ?? existing?.pdpaSignedDate ?? new Date() : null;
      }

      const lastSessionDate =
        existing?.lastSessionDate && existing.lastSessionDate > session.sessionDate ? existing.lastSessionDate : session.sessionDate;

      await prisma.$transaction(async (tx) => {
        const saved = existing
          ? await tx.participant.update({
              where: { id: existing.id },
              data: {
                ...data,
                ...(rec.tags.length ? { tags: serializeTags([...parseTags(existing.tags), ...rec.tags]) } : {}),
                ...(Object.keys(rec.extra).length ? { extraFields: serializeExtra({ ...parseExtra(existing.extraFields), ...rec.extra }) } : {}),
                status: d.status,
                totalInterviews: { increment: 1 },
                lastSessionDate,
              },
            })
          : await tx.participant.create({
              data: {
                ...data,
                firstName: rec.firstName,
                lastName: rec.lastName,
                phone: rec.phone,
                tags: serializeTags(rec.tags),
                extraFields: serializeExtra(rec.extra),
                status: d.status,
                totalInterviews: 1,
                lastSessionDate,
              },
            });
        await tx.researchSession.create({
          data: {
            participantId: saved.id,
            projectName: session.projectName,
            sessionDate: session.sessionDate,
            interviewer: session.interviewer,
            behaviorRating: d.rating,
          },
        });
        if (newFlag) {
          await tx.blacklistRecord.create({
            data: { participantId: saved.id, reason: d.reason!, details: d.details!.trim(), flaggedBy: session.interviewer },
          });
        }
      });

      result.saved++;
      result.sessions++;
      if (existing) result.updated++;
      else result.created++;
      if (newFlag) result.flagged++;
    } catch (e) {
      result.errors.push({ row: rowNo, message: e instanceof Error ? e.message.split("\n").pop()! : "Unknown error" });
    }
  }
  return result;
}
