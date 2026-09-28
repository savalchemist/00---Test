import { redirect } from "next/navigation";

// Import now lives at the bottom of Add Participant; keep old links working.
export default function ImportPage() {
  redirect("/participants/new#import");
}
