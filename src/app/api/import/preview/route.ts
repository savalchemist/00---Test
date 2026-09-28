import type { NextRequest } from "next/server";
import { MAX_PREVIEW_ROWS, fetchGoogleSheet, parseFile, toRawRows } from "@/lib/import";
import { suggestMapping } from "@/lib/import-mapping";
import { IMPORT_EXTENSIONS, NUMBERS_EXPORT_HINT, isImportable } from "@/lib/constants";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Parse a file (multipart "file") or a Google Sheets link (JSON { sheetUrl }) and return
 * raw rows plus a suggested column mapping. Nothing is written to the database.
 */
export async function POST(req: NextRequest) {
  let name: string;
  let buffer: Buffer;

  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await req.json().catch(() => null);
    const link = typeof body?.sheetUrl === "string" ? body.sheetUrl.trim() : "";
    if (!link) return jsonError("Paste a Google Sheets link");
    try {
      ({ name, buffer } = await fetchGoogleSheet(link));
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Couldn't fetch the sheet");
    }
  } else {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError("Attach a file in the “file” field");
    if (!isImportable(file.name)) return jsonError(`Unsupported file type. Use ${IMPORT_EXTENSIONS.join(", ")}`);
    if (file.size === 0) return jsonError(`The file is empty. ${NUMBERS_EXPORT_HINT}`);
    if (file.size > MAX_BYTES) return jsonError("File is larger than 10 MB");
    name = file.name;
    buffer = Buffer.from(await file.arrayBuffer());
  }

  let parsed: ReturnType<typeof toRawRows>;
  try {
    parsed = toRawRows(parseFile(buffer, name));
  } catch {
    return jsonError(
      name.toLowerCase().endsWith(".numbers")
        ? `This Numbers file couldn't be read. ${NUMBERS_EXPORT_HINT}`
        : "Could not read the file. Is it a valid spreadsheet?",
    );
  }
  if (!parsed.rows.length) return jsonError("The file has no data rows");
  if (parsed.rows.length > MAX_PREVIEW_ROWS) return jsonError(`Up to ${MAX_PREVIEW_ROWS} rows per import. Split the file and try again.`);

  const { mapping, confidence } = suggestMapping(parsed.headers);
  return Response.json({ source: name, headers: parsed.headers, rows: parsed.rows, mapping, confidence });
}
