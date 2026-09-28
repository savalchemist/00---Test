import { Suspense } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getAllTags, getFacetValues } from "@/lib/stats";
import { PageHeader } from "@/components/page-header";
import { ParticipantSearch } from "@/components/participant-search";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ParticipantsPage() {
  const [allTags, facets] = await Promise.all([getAllTags(), getFacetValues()]);
  return (
    <>
      <PageHeader
        title="Participants"
        description="Combine tags with AND / OR, filter by demographics, past behavior and interview recency."
        actions={
          <Button asChild>
            <Link href="/participants/new"><UserPlus /> Add participant</Link>
          </Button>
        }
      />
      <Suspense>
        <ParticipantSearch allTags={allTags} provinces={facets.provinces} genders={facets.genders} />
      </Suspense>
    </>
  );
}
