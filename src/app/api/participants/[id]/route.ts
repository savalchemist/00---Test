import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone, serializeExtra, serializeTags, toDTO } from "@/lib/participant";
import { firstIssue, participantInput } from "@/lib/validation";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const p = await prisma.participant.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { sessionDate: "desc" } },
      blacklistRecords: { orderBy: { flaggedAt: "desc" } },
    },
  });
  if (!p) return jsonError("Participant not found", 404);
  return Response.json(toDTO(p));
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const current = await prisma.participant.findUnique({ where: { id } });
  if (!current) return jsonError("Participant not found", 404);
  if (current.anonymizedAt) return jsonError("Anonymized profiles cannot be edited", 409);

  const parsed = participantInput.partial().safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));
  const { tags, phone, email, extraFields, ...rest } = parsed.data;

  const data: Prisma.ParticipantUpdateInput = { ...rest };
  if (tags) data.tags = serializeTags(tags);
  if (extraFields) data.extraFields = serializeExtra(extraFields);
  if (email !== undefined) data.email = email?.toLowerCase() ?? null;
  if (phone !== undefined) {
    const normalized = normalizePhone(phone);
    if (normalized.length < 9) return jsonError("Phone number looks invalid");
    data.phone = normalized;
  }
  if (rest.pdpaConsentSigned === false) data.pdpaSignedDate = null;
  if (rest.pdpaConsentSigned && !rest.pdpaSignedDate && !current.pdpaSignedDate) data.pdpaSignedDate = new Date();

  try {
    const updated = await prisma.participant.update({ where: { id }, data });
    return Response.json(toDTO(updated));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError("Phone or email is already used by another participant", 409);
    }
    throw e;
  }
}
