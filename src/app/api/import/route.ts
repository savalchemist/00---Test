import type { NextRequest } from "next/server";
import { importRows, parseFile } from "@/lib/import";
import { jsonError } from "@/lib/utils";
import { IMPORT_EXTENSIONS, NUMBERS_EXPORT_HINT, isImportable } from "@/lib/constants";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError("Attach a file in the “file” field");
  if (!isImportable(file.name)) return jsonError(`Unsupported file type. Use ${IMPORT_EXTENSIONS.join(", ")}`);
  if (file.size === 0) return jsonError(`The file is empty. ${NUMBERS_EXPORT_HINT}`);
  if (file.size > MAX_BYTES) return jsonError("File is larger than 10 MB");

  let rows: Record<string, unknown>[];
  try {
    rows = parseFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch {
    return jsonError(
      file.name.toLowerCase().endsWith(".numbers")
        ? `This Numbers file couldn't be read. ${NUMBERS_EXPORT_HINT}`
        : "Could not read the file. Is it a valid spreadsheet?",
    );
  }
  if (!rows.length) return jsonError("The file has no data rows");

  return Response.json(await importRows(rows));
}
