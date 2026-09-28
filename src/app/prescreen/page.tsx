import { PageHeader } from "@/components/page-header";
import { PrescreenTool } from "@/components/prescreen-tool";

export default function PrescreenPage() {
  return (
    <>
      <PageHeader
        title="Check Profile"
        description="Paste phone numbers or names from a recruit list to see who is จริง, who is เก๊, and how often they've been interviewed."
      />
      <PrescreenTool />
    </>
  );
}
