import type { NextRequest } from "next/server";
import { z } from "zod";
import { commitImport } from "@/lib/import";
import { firstIssue } from "@/lib/validation";
import { jsonError } from "@/lib/utils";

const target = z.enum([
  "firstName", "lastName", "fullName", "phone", "email", "lineId", "age", "gender", "occupation",
  "monthlyIncome", "province", "tags", "pdpaConsentSigned", "pdpaSignedDate", "extra", "ignore",
]);

const commitInput = z.object({
  rows: z.array(z.record(z.string())).min(1).max(2000),
  mapping: z.record(target),
  session: z.object({
    projectName: z.string().trim().min(1, "Project name is required"),
    sessionDate: z.coerce.date(),
    interviewer: z.string().trim().min(1, "Interviewer is required"),
  }),
  decisions: z
    .array(
      z.object({
        index: z.number().int().min(0),
        status: z.enum(["REAL", "GEH"], { message: "Every row needs a flag (จริง / เก๊)" }),
        rating: z.number().int().min(1, "Every row needs a rating").max(3),
        reason: z.enum(["NO_SHOW", "FAKE_PROFILE", "INAPPROPRIATE_BEHAVIOR", "OTHER"]).optional(),
        details: z.string().optional(),
      }),
    )
    .min(1, "Select at least one row to save"),
});

export async function POST(req: NextRequest) {
  const parsed = commitInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));
  const { rows, mapping, session, decisions } = parsed.data;

  if (!Object.values(mapping).includes("phone")) return jsonError("Map one column to Phone before saving");
  const indexes = decisions.map((d) => d.index);
  if (new Set(indexes).size !== indexes.length) return jsonError("Duplicate rows in request");
  if (indexes.some((i) => i >= rows.length)) return jsonError("Row index out of range");

  return Response.json(await commitImport(rows, mapping, decisions, session));
}
