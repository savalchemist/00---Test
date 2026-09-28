import type { BlacklistReason, ParticipantStatus } from "@prisma/client";

export const STATUS_LABEL: Record<ParticipantStatus, string> = {
  REAL: "จริง",
  GEH: "เก๊",
};

export const REASON_LABEL: Record<BlacklistReason, string> = {
  NO_SHOW: "No-show",
  FAKE_PROFILE: "Fake profile",
  INAPPROPRIATE_BEHAVIOR: "Inappropriate behavior",
  OTHER: "Other",
};

export const RATING_LABEL: Record<number, string> = {
  1: "ตอบงง",
  2: "พูดไม่ค่อยเก่ง พอให้ข้อมูลได้",
  3: "เล่าดี",
};

export const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

export const INCOME_OPTIONS = [
  "< 15,000",
  "15,000 – 30,000",
  "30,001 – 50,000",
  "50,001 – 100,000",
  "> 100,000",
];

export const ANON_PHONE_PREFIX = "ANON-";

/** Spreadsheet formats the importer accepts (Excel, Apple Numbers, LibreOffice, plain text). */
export const IMPORT_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".numbers", ".ods", ".csv", ".tsv"];
export const isImportable = (name: string) => IMPORT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
export const NUMBERS_EXPORT_HINT = "In Numbers, choose File → Export To → Excel…, then upload the .xlsx file.";
