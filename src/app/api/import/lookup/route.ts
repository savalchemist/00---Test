import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/participant";

/** Body: { phones: string[] } → which of them already exist, with their current status. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phones: string[] = Array.isArray(body?.phones)
    ? [...new Set(body.phones.map((p: unknown) => normalizePhone(p)).filter((p: string) => p.length >= 9))].slice(0, 5000) as string[]
    : [];
  if (!phones.length) return Response.json({});

  const found = await prisma.participant.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true, firstName: true, lastName: true, status: true, totalInterviews: true },
  });
  return Response.json(Object.fromEntries(found.map((p) => [p.phone, p])));
}
