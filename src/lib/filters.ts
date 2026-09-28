import type { Prisma } from "@prisma/client";
import { normalizePhone } from "./participant";

export type TagMode = "AND" | "OR";

const list = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const int = (v: string | null) => (v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
const date = (v: string | null) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * Translate URL search params into a Prisma where clause.
 * Supported: q, status, tags, tagMode, ageMin, ageMax, gender, province, occupation,
 * rating (1,2,3), sessionsMin, sessionsMax, lastFrom, lastTo, never (=1), pdpa (yes|no)
 */
export function buildParticipantWhere(sp: URLSearchParams): Prisma.ParticipantWhereInput {
  const and: Prisma.ParticipantWhereInput[] = [];

  const q = sp.get("q")?.trim();
  if (q) {
    const or: Prisma.ParticipantWhereInput[] = [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } },
      { lineId: { contains: q } },
      { occupation: { contains: q } },
      { extraFields: { contains: q } },
    ];
    const digits = normalizePhone(q);
    if (digits.length >= 3) or.push({ phone: { contains: digits } });
    const [first, ...rest] = q.split(/\s+/);
    if (rest.length) or.push({ firstName: { contains: first }, lastName: { contains: rest.join(" ") } });
    and.push({ OR: or });
  }

  const status = sp.get("status");
  if (status === "REAL" || status === "GEH") and.push({ status });

  const tags = list(sp.get("tags"));
  if (tags.length) {
    const clauses = tags.map((t) => ({ tags: { contains: `"${t}"` } }));
    and.push(sp.get("tagMode") === "OR" ? { OR: clauses } : { AND: clauses });
  }

  const ageMin = int(sp.get("ageMin"));
  const ageMax = int(sp.get("ageMax"));
  if (ageMin !== undefined || ageMax !== undefined) and.push({ age: { gte: ageMin, lte: ageMax } });

  const genders = list(sp.get("gender"));
  if (genders.length) and.push({ gender: { in: genders } });

  const provinces = list(sp.get("province"));
  if (provinces.length) and.push({ province: { in: provinces } });

  const occupation = sp.get("occupation")?.trim();
  if (occupation) and.push({ occupation: { contains: occupation } });

  const ratings = list(sp.get("rating")).map(Number).filter((n) => [1, 2, 3].includes(n));
  if (ratings.length) and.push({ sessions: { some: { behaviorRating: { in: ratings } } } });

  const sMin = int(sp.get("sessionsMin"));
  const sMax = int(sp.get("sessionsMax"));
  if (sMin !== undefined || sMax !== undefined) and.push({ totalInterviews: { gte: sMin, lte: sMax } });

  if (sp.get("never") === "1") {
    and.push({ lastSessionDate: null });
  } else {
    const from = date(sp.get("lastFrom"));
    const to = date(sp.get("lastTo"));
    if (to) to.setHours(23, 59, 59, 999);
    if (from || to) and.push({ lastSessionDate: { gte: from, lte: to } });
  }

  const pdpa = sp.get("pdpa");
  if (pdpa === "yes") and.push({ pdpaConsentSigned: true });
  if (pdpa === "no") and.push({ pdpaConsentSigned: false });

  return and.length ? { AND: and } : {};
}

export function buildOrderBy(sort: string | null): Prisma.ParticipantOrderByWithRelationInput {
  switch (sort) {
    case "name":
      return { firstName: "asc" };
    case "sessions":
      return { totalInterviews: "desc" };
    case "recent":
      return { lastSessionDate: { sort: "desc", nulls: "last" } };
    default:
      return { updatedAt: "desc" };
  }
}
