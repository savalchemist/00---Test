import { buildTemplate } from "@/lib/import";

export const runtime = "nodejs";

export function GET() {
  return new Response(new Uint8Array(buildTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="participant-hub-template.xlsx"',
    },
  });
}
