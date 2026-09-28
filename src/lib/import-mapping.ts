/**
 * Column mapping for spreadsheet imports. Pure functions only (no DB access), so the
 * review screen and the server apply exactly the same rules to the same raw rows.
 */
import { cleanTags, normalizePhone } from "./participant";

export type FieldKey =
  | "firstName"
  | "lastName"
  | "fullName"
  | "phone"
  | "email"
  | "lineId"
  | "age"
  | "gender"
  | "occupation"
  | "monthlyIncome"
  | "province"
  | "tags"
  | "pdpaConsentSigned"
  | "pdpaSignedDate";

/** Where a column goes: a template field, the participant's extra fields, or nowhere. */
export type Target = FieldKey | "extra" | "ignore";
export type Mapping = Record<string, Target>;
export type Confidence = "exact" | "fuzzy" | "none";
export type RawRow = Record<string, string>;

export const FIELD_LABEL: Record<FieldKey, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name (split)",
  phone: "Phone",
  email: "Email",
  lineId: "LINE ID",
  age: "Age",
  gender: "Gender",
  occupation: "Occupation",
  monthlyIncome: "Monthly income",
  province: "Province",
  tags: "Tags",
  pdpaConsentSigned: "PDPA consent",
  pdpaSignedDate: "PDPA signed date",
};

export const TARGET_LABEL: Record<Target, string> = {
  ...FIELD_LABEL,
  extra: "ข้อมูลเพิ่มเติม (Extra info)",
  ignore: "ไม่นำเข้า (Ignore)",
};

/** Header aliases (EN + TH), compared after lowercasing and stripping spaces/punctuation. */
export const ALIASES: Record<FieldKey, string[]> = {
  firstName: ["firstname", "first", "givenname", "ชื่อ", "ชื่อจริง"],
  lastName: ["lastname", "surname", "familyname", "last", "นามสกุล"],
  fullName: ["name", "fullname", "participantname", "ชื่อนามสกุล", "ชื่อสกุล"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "tel", "telephone", "เบอร์", "เบอร์โทร", "เบอร์โทรศัพท์", "โทรศัพท์", "มือถือ", "เบอร์มือถือ", "หมายเลขโทรศัพท์", "phoneno", "contactnumber", "cellphone"],
  email: ["email", "emailaddress", "mail", "อีเมล", "อีเมล์"],
  lineId: ["lineid", "line", "ไลน์", "ไอดีไลน์", "ไลน์ไอดี"],
  age: ["age", "อายุ"],
  gender: ["gender", "sex", "เพศ"],
  occupation: ["occupation", "job", "jobtitle", "position", "profession", "อาชีพ", "ตำแหน่ง", "ตำแหน่งงาน"],
  monthlyIncome: ["monthlyincome", "income", "salary", "รายได้", "รายได้ต่อเดือน"],
  province: ["province", "location", "city", "จังหวัด", "ที่อยู่"],
  tags: ["tags", "tag", "segments", "segment", "แท็ก", "กลุ่ม"],
  pdpaConsentSigned: ["pdpa", "pdpaconsent", "pdpaconsentsigned", "consent", "ยินยอม", "pdpaยินยอม"],
  pdpaSignedDate: ["pdpasigneddate", "pdpadate", "consentdate", "วันที่ยินยอม"],
};

/** Name fields are too ambiguous for fuzzy matching ("ชื่อเล่น", "ชื่อบริษัท" are not names). */
const EXACT_ONLY: FieldKey[] = ["firstName", "lastName", "fullName"];

export const normHeader = (h: string) => h.toLowerCase().replace(/[\s_\-.()/:#*]/g, "");

function editDistance(a: string, b: string) {
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

/** 3 = exact alias, 2 = starts with an alias, 1 = contains an alias or one-letter typo, 0 = no match. */
function scoreHeader(key: string, field: FieldKey): number {
  const aliases = ALIASES[field];
  if (aliases.includes(key)) return 3;
  if (EXACT_ONLY.includes(field) || !key) return 0;
  if (aliases.some((a) => a.length >= 4 && key.startsWith(a))) return 2;
  if (aliases.some((a) => a.length >= 5 && (key.includes(a) || editDistance(key, a) <= 1))) return 1;
  return 0;
}

const isBlankHeader = (h: string) => !h.trim() || /^__EMPTY(_\d+)?$/.test(h);

/**
 * Suggest a target for every header. Each template field is claimed by its best-scoring
 * header (tags may take several); everything else becomes extra info.
 */
export function suggestMapping(headers: string[]): { mapping: Mapping; confidence: Record<string, Confidence> } {
  const mapping: Mapping = {};
  const confidence: Record<string, Confidence> = {};
  const candidates: { header: string; field: FieldKey; score: number; order: number }[] = [];

  headers.forEach((header, order) => {
    const key = normHeader(header);
    for (const field of Object.keys(ALIASES) as FieldKey[]) {
      const score = scoreHeader(key, field);
      if (score) candidates.push({ header, field, score, order });
    }
  });
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);

  const taken = new Set<FieldKey>();
  for (const c of candidates) {
    if (mapping[c.header]) continue;
    if (taken.has(c.field) && c.field !== "tags") continue;
    mapping[c.header] = c.field;
    confidence[c.header] = c.score === 3 ? "exact" : "fuzzy";
    taken.add(c.field);
  }
  // A full-name column is redundant when first + last name columns exist.
  const fullHeader = Object.keys(mapping).find((h) => mapping[h] === "fullName");
  if (fullHeader && taken.has("firstName") && taken.has("lastName")) {
    mapping[fullHeader] = "extra";
    confidence[fullHeader] = "none";
  }
  for (const header of headers) {
    if (!mapping[header]) {
      mapping[header] = isBlankHeader(header) ? "ignore" : "extra";
      confidence[header] = "none";
    }
  }
  return { mapping, confidence };
}

export type MappedRecord = {
  firstName: string;
  lastName: string;
  phone: string; // normalized digits
  email: string;
  lineId: string;
  age?: number;
  gender: string;
  occupation: string;
  monthlyIncome: string;
  province: string;
  tags: string[];
  pdpaConsentSigned?: boolean;
  pdpaSignedDate: Date | null;
  extra: Record<string, string>;
  /** Problems that stop this row from being saved. */
  errors: string[];
};

const truthy = (v: string) => /^(y|yes|true|1|✓|✔|x|ใช่|ยินยอม|signed)$/i.test(v.trim());
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Apply a mapping to one raw row. Only non-empty cells produce values. */
export function mapRow(row: RawRow, mapping: Mapping): MappedRecord {
  const rec: MappedRecord = {
    firstName: "", lastName: "", phone: "", email: "", lineId: "", gender: "", occupation: "",
    monthlyIncome: "", province: "", tags: [], pdpaSignedDate: null, extra: {}, errors: [],
  };
  let fullName = "";
  let rawPhone = "";

  for (const [header, target] of Object.entries(mapping)) {
    const v = String(row[header] ?? "").trim();
    if (!v || target === "ignore") continue;
    switch (target) {
      case "extra":
        rec.extra[header.trim()] = v;
        break;
      case "fullName":
        fullName ||= v;
        break;
      case "phone":
        rawPhone ||= v;
        break;
      case "email":
        rec.email ||= v.toLowerCase();
        break;
      case "age": {
        const n = Number(v);
        if (rec.age === undefined && !Number.isNaN(n)) rec.age = Math.round(n);
        break;
      }
      case "tags":
        rec.tags = cleanTags([...rec.tags, ...cleanTags(v)]);
        break;
      case "pdpaConsentSigned":
        rec.pdpaConsentSigned ??= truthy(v);
        break;
      case "pdpaSignedDate":
        rec.pdpaSignedDate ??= toDate(v);
        break;
      default:
        if (!rec[target]) rec[target] = v;
    }
  }

  if (!rec.firstName && fullName) {
    const [f, ...rest] = fullName.split(/\s+/);
    rec.firstName = f;
    rec.lastName ||= rest.join(" ");
  }
  rec.phone = normalizePhone(rawPhone);
  if (rec.phone.length < 9) rec.errors.push(rawPhone ? `Invalid phone “${rawPhone}”` : "Missing phone number");
  if (rec.email && !EMAIL_RE.test(rec.email)) {
    rec.extra["Email (invalid)"] = rec.email;
    rec.email = "";
  }
  return rec;
}
