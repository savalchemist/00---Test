import { redirect } from "next/navigation";

// Standalone Log Session page was removed; sessions are logged from a participant's profile.
export default function NewSessionPage() {
  redirect("/participants");
}
