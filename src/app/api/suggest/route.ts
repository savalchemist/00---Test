import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/participant";
import { getAllTags } from "@/lib/stats";

/** Edit distance, used to tolerate small typos in short values (tags, provinces, occupations). */
function distance(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Higher is better; 0 means "not similar". Prefix > word-prefix > contains > typo-tolerant. */
function score(value: string, q: string) {
  const v = value.toLowerCase();
  if (v.startsWith(q)) return 4;
  if (v.split(/[\s,/-]+/).some((w) => w.startsWith(q))) return 3;
  if (v.includes(q)) return 2;
  if (q.length >= 3) {
    const head = v.slice(0, Math.max(q.length, 1));
    const allowed = q.length >= 6 ? 2 : 1;
    if (distance(head, q) <= allowed || distance(v, q) <= allowed) return 1;
  }
  return 0;
}

function rank<T>(items: T[], key: (t: T) => string, weight: (t: T) => number, q: string, take: number) {
  return items
    .map((item) => ({ item, s: score(key(item), q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || weight(b.item) - weight(a.item))
    .slice(0, take)
    .map((x) => x.item);
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!raw) return Response.json({ participants: [], tags: [], provinces: [], occupations: [] });
  const q = raw.toLowerCase();

  const digits = normalizePhone(raw);
  const [first, ...rest] = raw.split(/\s+/);
  const or = [
    { firstName: { contains: raw } },
    { lastName: { contains: raw } },
    { email: { contains: raw } },
    { lineId: { contains: raw } },
    ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ...(rest.length ? [{ firstName: { contains: first }, lastName: { contains: rest.join(" ") } }] : []),
  ];

  const [participants, tags, provinceGroups, occupationGroups] = await Promise.all([
    prisma.participant.findMany({
      where: { anonymizedAt: null, OR: or },
      select: { id: true, firstName: true, lastName: true, phone: true, status: true, occupation: true, province: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    getAllTags(),
    prisma.participant.groupBy({ by: ["province"], where: { province: { not: null } }, _count: { _all: true } }),
    prisma.participant.groupBy({ by: ["occupation"], where: { occupation: { not: null } }, _count: { _all: true } }),
  ]);

  const provinces = provinceGroups.map((g) => ({ value: g.province!, count: g._count._all }));
  const occupations = occupationGroups.map((g) => ({ value: g.occupation!, count: g._count._all }));

  return Response.json({
    participants,
    tags: rank(tags, (t) => t.tag, (t) => t.count, q, 5),
    provinces: rank(provinces, (p) => p.value, (p) => p.count, q, 3),
    occupations: rank(occupations, (o) => o.value, (o) => o.count, q, 3),
  });
}
