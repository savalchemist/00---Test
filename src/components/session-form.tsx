"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { RATING_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ParticipantStatus } from "@prisma/client";

type Picked = { id: string; firstName: string; lastName: string; phone: string; status: ParticipantStatus };

const today = () => new Date().toISOString().slice(0, 10);

/** Log a research session. If `participantId` is omitted, shows a participant picker first. */
export function SessionForm({ participantId, onDone }: { participantId?: string; onDone?: () => void }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Picked[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ projectName: "", sessionDate: today(), interviewer: "", behaviorRating: 0, keyTakeaways: "" });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ph:interviewer");
      if (saved) setForm((f) => ({ ...f, interviewer: saved }));
    } catch {}
  }, []);

  useEffect(() => {
    if (participantId || query.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/participants?pageSize=8&q=${encodeURIComponent(query.trim())}`);
      if (res.ok) setResults((await res.json()).data);
    }, 250);
    return () => clearTimeout(t);
  }, [query, participantId]);

  const targetId = participantId ?? picked?.id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) return toast.error("Choose a participant first");
    if (!form.behaviorRating) return toast.error("Select a behavior rating");
    setSaving(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, participantId: targetId }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) return toast.error(body.error ?? "Could not save session");
    try { localStorage.setItem("ph:interviewer", form.interviewer); } catch {}
    toast.success("Session logged");
    if (onDone) {
      onDone();
      router.refresh();
    } else {
      router.push(`/participants/${targetId}`);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      {!participantId && (
        <Field label="Participant" required>
          {picked ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{picked.firstName} {picked.lastName}</span>
                <span className="text-muted-foreground">{picked.phone}</span>
                <StatusBadge status={picked.status} />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>Change</Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone…" />
              {results.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-md">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => { setPicked(r); setQuery(""); }} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
                        <span>{r.firstName} {r.lastName} <span className="text-muted-foreground">· {r.phone}</span></span>
                        <StatusBadge status={r.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {picked?.status === "GEH" && <p className="text-xs text-destructive">This participant is flagged เก๊. Double-check before logging.</p>}
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" htmlFor="projectName" required className="sm:col-span-2">
          <Input id="projectName" required value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} />
        </Field>
        <Field label="Session date" htmlFor="sessionDate" required>
          <Input id="sessionDate" type="date" required value={form.sessionDate} onChange={(e) => setForm({ ...form, sessionDate: e.target.value })} />
        </Field>
        <Field label="Interviewer" htmlFor="interviewer" required>
          <Input id="interviewer" required value={form.interviewer} onChange={(e) => setForm({ ...form, interviewer: e.target.value })} />
        </Field>
      </div>

      <Field label="Behavior rating" required>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {[1, 2, 3].map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={form.behaviorRating === r}
              onClick={() => setForm({ ...form, behaviorRating: r })}
              className={cn(
                "rounded-md border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                form.behaviorRating === r && "border-primary bg-accent ring-1 ring-primary",
              )}
            >
              <span className="font-semibold">{r}</span> <span className="text-muted-foreground">· {RATING_LABEL[r]}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Key takeaways" htmlFor="keyTakeaways">
        <Textarea id="keyTakeaways" rows={4} value={form.keyTakeaways} onChange={(e) => setForm({ ...form, keyTakeaways: e.target.value })} />
      </Field>

      <div>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Log session
        </Button>
      </div>
    </form>
  );
}
