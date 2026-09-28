import { prisma } from "./prisma";
import { parseTags } from "./participant";

export async function getStats() {
  const [total, real, geh, sessions] = await Promise.all([
    prisma.participant.count(),
    prisma.participant.count({ where: { status: "REAL" } }),
    prisma.participant.count({ where: { status: "GEH" } }),
    prisma.researchSession.count(),
  ]);
  return { total, real, geh, sessions };
}

/** Distinct tags with usage counts, most used first. */
export async function getAllTags() {
  const rows = await prisma.participant.findMany({ select: { tags: true } });
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of parseTags(r.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

export async function getFacetValues() {
  const [provinces, genders] = await Promise.all([
    prisma.participant.findMany({ where: { province: { not: null } }, distinct: ["province"], select: { province: true }, orderBy: { province: "asc" } }),
    prisma.participant.findMany({ where: { gender: { not: null } }, distinct: ["gender"], select: { gender: true }, orderBy: { gender: "asc" } }),
  ]);
  return {
    provinces: provinces.map((p) => p.province!).filter(Boolean),
    genders: genders.map((g) => g.gender!).filter(Boolean),
  };
}
