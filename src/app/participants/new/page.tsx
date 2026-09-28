import { Download } from "lucide-react";
import { getAllTags } from "@/lib/stats";
import { PageHeader } from "@/components/page-header";
import { ParticipantForm } from "@/components/participant-form";
import { ImportUploader } from "@/components/import-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function NewParticipantPage() {
  const tags = await getAllTags();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Add Participant" description="Phone number is checked against the database to prevent duplicates." />
        <Card>
          <CardContent className="p-5 sm:p-6">
            <ParticipantForm tagSuggestions={tags.map((t) => t.tag)} />
          </CardContent>
        </Card>
      </div>

      <section id="import" className="mt-12 scroll-mt-20 border-t pt-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Import from Excel / CSV</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Headers don’t need to match the template exactly — columns are matched for you and you can adjust them. Review every row, set its flag and rating, then save.
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <a href="/api/template" download><Download /> Download template</a>
          </Button>
        </div>
        <ImportUploader />
        <ul className="mt-6 grid gap-1 text-sm text-muted-foreground">
          <li>• Nothing is saved until you press Save on the review screen.</li>
          <li>• Existing phone numbers are updated; blank cells never overwrite existing data, and tags merge.</li>
          <li>• Columns that aren&apos;t in the template are kept as “extra info” on each profile.</li>
          <li>• Each saved row logs one research session with the rating you choose, and its จริง / เก๊ flag is applied.</li>
        </ul>
      </section>
    </div>
  );
}
