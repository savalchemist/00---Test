import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { firstIssue, sessionInput } from "@/lib/validation";
import { jsonError } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId") ?? undefined;
  const sessions = await prisma.researchSession.findMany({
    where: { participantId },
    orderBy: { sessionDate: "desc" },
    take: 100,
  });
  return Response.json(sessions);
}

/** Log a session, increment totalInterviews and keep lastSessionDate at the most recent session. */
export async function POST(req: NextRequest) {
  const parsed = sessionInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));
  const input = parsed.data;

  const p = await prisma.participant.findUnique({
    where: { id: input.participantId },
    select: { lastSessionDate: true },
  });
  if (!p) return jsonError("Participant not found", 404);

  const lastSessionDate =
    !p.lastSessionDate || input.sessionDate > p.lastSessionDate ? input.sessionDate : p.lastSessionDate;

  const [session] = await prisma.$transaction([
    prisma.researchSession.create({ data: input }),
    prisma.participant.update({
      where: { id: input.participantId },
      data: { totalInterviews: { increment: 1 }, lastSessionDate },
    }),
  ]);
  return Response.json(session, { status: 201 });
}
