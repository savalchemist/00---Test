import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/participant";
import { jsonError } from "@/lib/utils";

const MAX_LINES = 500;

/**
 * Body: { entries: string[] } — each entry is a phone number or a name.
 * Returns one result per entry with every matching participant.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const entries: string[] = Array.isArray(body?.entries)
    ? body.entries.map((e: unknown) => String(e).trim()).filter(Boolean)
    : [];
  if (!entries.length) return jsonError("Paste at least one phone number or name");
  if (entries.length > MAX_LINES) return jsonError(`Up to ${MAX_LINES} entries per check`);

  const select = {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    status: true,
    totalInterviews: true,
    lastSessionDate: true,
    anonymizedAt: true,
  } as const;

  const results = await Promise.all(
    entries.map(async (input) => {
      const digits = normalizePhone(input);
      const isPhone = digits.length >= 9 && /^[\d\s+\-().]+$/.test(input);
      if (isPhone) {
        const match = await prisma.participant.findUnique({ where: { phone: digits }, select });
        return { input, type: "phone" as const, matches: match ? [match] : [] };
      }
      const [first, ...rest] = input.split(/\s+/);
      const matches = await prisma.participant.findMany({
        where: rest.length
          ? { firstName: { contains: first }, lastName: { contains: rest.join(" ") } }
          : { OR: [{ firstName: { contains: first } }, { lastName: { contains: first } }] },
        select,
        take: 10,
      });
      return { input, type: "name" as const, matches };
    }),
  );

  return Response.json({ results });
}
