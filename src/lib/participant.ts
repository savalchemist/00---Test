import type { Participant } from "@prisma/client";

/** Digits only, Thai-mobile friendly: +66 812345678 → 0812345678, 812345678 → 0812345678. */
export function normalizePhone(raw: unknown): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length === 11) digits = "0" + digits.slice(2);
  // Excel often strips the leading zero from numeric cells.
  if (digits.length === 9 && /^[689]/.test(digits)) digits = "0" + digits;
  return digits;
}

export function parseTags(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function cleanTags(input: unknown): string[] {
  const list = Array.isArray(input) ? input : String(input ?? "").split(/[,;|\n]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of list) {
    // Double quotes would break the `contains: '"tag"'` filter strategy.
    const tag = String(t).replace(/"/g, "").trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
}

export const serializeTags = (tags: string[]) => JSON.stringify(cleanTags(tags));

export type ParticipantDTO = Omit<Participant, "tags"> & { tags: string[] };

export function toDTO<T extends Participant>(p: T): Omit<T, "tags"> & { tags: string[] } {
  return { ...p, tags: parseTags(p.tags) };
}

export function fullName(p: Pick<Participant, "firstName" | "lastName" | "anonymizedAt">) {
  if (p.anonymizedAt) return "Anonymized participant";
  return `${p.firstName} ${p.lastName}`.trim();
}

export function parseExtra(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")]));
  } catch {
    return {};
  }
}

/** Drop blank keys/values so the stored object stays clean. */
export function serializeExtra(extra: Record<string, string>): string {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(extra)) {
    const key = k.trim();
    const val = String(v ?? "").trim();
    if (key && val) clean[key] = val;
  }
  return JSON.stringify(clean);
}
