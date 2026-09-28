import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

/** Restore a participant to "จริง". Blacklist records are kept for history. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exists = await prisma.participant.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return jsonError("Participant not found", 404);
  await prisma.participant.update({ where: { id }, data: { status: "REAL" } });
  return Response.json({ ok: true });
}
