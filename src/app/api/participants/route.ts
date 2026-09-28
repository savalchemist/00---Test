import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildOrderBy, buildParticipantWhere } from "@/lib/filters";
import { normalizePhone, serializeExtra, serializeTags, toDTO } from "@/lib/participant";
import { firstIssue, participantInput } from "@/lib/validation";
import { jsonError } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 25));
  const where = buildParticipantWhere(sp);

  const [total, rows] = await Promise.all([
    prisma.participant.count({ where }),
    prisma.participant.findMany({
      where,
      orderBy: buildOrderBy(sp.get("sort")),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return Response.json({ total, page, pageSize, data: rows.map(toDTO) });
}

export async function POST(req: NextRequest) {
  const parsed = participantInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));
  const { extraFields, ...input } = parsed.data;

  const phone = normalizePhone(input.phone);
  if (phone.length < 9) return jsonError("Phone number looks invalid");

  const existing = await prisma.participant.findUnique({ where: { phone }, select: { id: true, status: true } });
  if (existing) {
    return jsonError("A participant with this phone number already exists", 409, { participantId: existing.id, status: existing.status });
  }

  try {
    const created = await prisma.participant.create({
      data: {
        ...input,
        phone,
        email: input.email?.toLowerCase() ?? null,
        tags: serializeTags(input.tags),
        extraFields: serializeExtra(extraFields ?? {}),
        pdpaSignedDate: input.pdpaConsentSigned ? input.pdpaSignedDate ?? new Date() : null,
      },
    });
    return Response.json(toDTO(created), { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError("Email is already used by another participant", 409);
    }
    throw e;
  }
}
