import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { firstIssue, flagInput } from "@/lib/validation";
import { jsonError } from "@/lib/utils";

/** Instant blacklist ("เก๊") — no approval step. Every flag is kept as an audit record. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = flagInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const exists = await prisma.participant.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return jsonError("Participant not found", 404);

  const [record] = await prisma.$transaction([
    prisma.blacklistRecord.create({ data: { participantId: id, ...parsed.data } }),
    prisma.participant.update({ where: { id }, data: { status: "GEH" } }),
  ]);
  return Response.json(record, { status: 201 });
}
