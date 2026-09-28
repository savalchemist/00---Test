import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAllTags } from "@/lib/stats";
import { parseExtra, parseTags } from "@/lib/participant";
import { PageHeader } from "@/components/page-header";
import { ParticipantForm } from "@/components/participant-form";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function EditParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, tags] = await Promise.all([prisma.participant.findUnique({ where: { id } }), getAllTags()]);
  if (!p) notFound();
  if (p.anonymizedAt) redirect(`/participants/${id}`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${p.firstName} ${p.lastName}`} />
      <Card>
        <CardContent className="p-5 sm:p-6">
          <ParticipantForm
            participantId={p.id}
            tagSuggestions={tags.map((t) => t.tag)}
            initial={{
              firstName: p.firstName,
              lastName: p.lastName,
              phone: p.phone,
              email: p.email ?? "",
              lineId: p.lineId ?? "",
              age: p.age?.toString() ?? "",
              gender: p.gender ?? "",
              occupation: p.occupation ?? "",
              monthlyIncome: p.monthlyIncome ?? "",
              province: p.province ?? "",
              tags: parseTags(p.tags),
              pdpaConsentSigned: p.pdpaConsentSigned,
              pdpaSignedDate: p.pdpaSignedDate?.toISOString().slice(0, 10) ?? "",
              extraFields: Object.entries(parseExtra(p.extraFields)).map(([key, value]) => ({ key, value })),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
