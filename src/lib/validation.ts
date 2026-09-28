import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const participantInput = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().default(""),
  phone: z.string().trim().min(1, "Phone is required"),
  email: optionalText.pipe(z.string().email("Invalid email").nullable()),
  lineId: optionalText,
  age: z.coerce.number().int().min(0).max(120).optional().nullable(),
  gender: optionalText,
  occupation: optionalText,
  monthlyIncome: optionalText,
  province: optionalText,
  tags: z.array(z.string()).default([]),
  pdpaConsentSigned: z.boolean().default(false),
  pdpaSignedDate: z.coerce.date().optional().nullable(),
  /** Extra info not in the template, e.g. { "รุ่นรถ": "Civic" }. */
  extraFields: z.record(z.string()).optional(),
});

export const sessionInput = z.object({
  participantId: z.string().min(1),
  projectName: z.string().trim().min(1, "Project name is required"),
  sessionDate: z.coerce.date(),
  interviewer: z.string().trim().min(1, "Interviewer is required"),
  behaviorRating: z.coerce.number().int().min(1).max(3),
  keyTakeaways: z.string().trim().default(""),
});

export const flagInput = z.object({
  reason: z.enum(["NO_SHOW", "FAKE_PROFILE", "INAPPROPRIATE_BEHAVIOR", "OTHER"]),
  details: z.string().trim().min(5, "Please describe what happened (min 5 characters)"),
  flaggedBy: z.string().trim().min(1, "Your name is required"),
});

export function firstIssue(err: z.ZodError) {
  const i = err.issues[0];
  return i ? `${i.path.join(".") || "input"}: ${i.message}` : "Invalid input";
}
