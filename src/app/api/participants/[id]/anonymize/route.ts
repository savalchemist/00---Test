import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ANON_PHONE_PREFIX } from "@/lib/constants";
import { jsonError } from "@/lib/utils";

/**
 * PDPA right to be forgotten: strip direct identifiers (name, phone, email, LINE ID)
 * and imported extra info (free-form columns may contain personal data),
 * keep demographics, tags, status and session history for research continuity.
 * Phone is unique + required, so it is replaced with a non-identifying placeholder.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.participant.findUnique({ where: { id }, select: { id: true, anonymizedAt: true } });
  if (!p) return jsonError("Participant not found", 404);
  if (p.anonymizedAt) return jsonError("Profile is already anonymized", 409);

  const updated = await prisma.participant.update({
    where: { id },
    data: {
      firstName: "Anonymized",
      lastName: "",
      phone: `${ANON_PHONE_PREFIX}${id}`,
      email: null,
      lineId: null,
      extraFields: "{}",
      anonymizedAt: new Date(),
    },
  });
  return Response.json({ ok: true, anonymizedAt: updated.anonymizedAt });
}
