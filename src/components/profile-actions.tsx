"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Flag, Loader2, RotateCcw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { SessionForm } from "@/components/session-form";
import { REASON_LABEL } from "@/lib/constants";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

export function LogSessionDialog({ participantId }: { participantId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><CalendarPlus /> Log session</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Log research session</DialogTitle>
          <DialogDescription>Adds to the timeline and increments the interview count.</DialogDescription>
        </DialogHeader>
        <SessionForm participantId={participantId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function FlagDialog({ participantId, name }: { participantId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ reason: "", details: "", flaggedBy: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await post(`/api/participants/${participantId}/flag`, form);
      toast.success(`${name} flagged as เก๊`);
      setOpen(false);
      setForm({ reason: "", details: "", flaggedBy: form.flaggedBy });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive"><Flag /> Flag as เก๊</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag as เก๊ (blacklist)</DialogTitle>
          <DialogDescription>Takes effect immediately for the whole team. A reason and details are required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Reason" htmlFor="reason" required>
            <NativeSelect id="reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              <option value="" disabled>Select a reason</option>
              {Object.entries(REASON_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Details" htmlFor="details" required>
            <Textarea id="details" required minLength={5} rows={4} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="What happened? Which project?" />
          </Field>
          <Field label="Flagged by" htmlFor="flaggedBy" required>
            <Input id="flaggedBy" required value={form.flaggedBy} onChange={(e) => setForm({ ...form, flaggedBy: e.target.value })} placeholder="Your name" />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Flag participant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReinstateButton({ participantId }: { participantId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={saving}
      onClick={async () => {
        if (!confirm("Restore this participant to จริง? Past blacklist records stay in the history.")) return;
        setSaving(true);
        try {
          await post(`/api/participants/${participantId}/reinstate`);
          toast.success("Restored to จริง");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <RotateCcw /> Restore to จริง
    </Button>
  );
}

export function AnonymizeDialog({ participantId }: { participantId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [saving, setSaving] = useState(false);

  async function run() {
    setSaving(true);
    try {
      await post(`/api/participants/${participantId}/anonymize`);
      toast.success("Profile anonymized");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setConfirmText(""); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-muted-foreground"><ShieldOff /> Anonymize profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anonymize profile (PDPA)</DialogTitle>
          <DialogDescription>
            Permanently removes first/last name, phone, email, LINE ID and imported extra info. Demographics, tags, status and session history are kept. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Field label='Type "ANONYMIZE" to confirm' htmlFor="confirm">
          <Input id="confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </Field>
        <DialogFooter>
          <Button variant="destructive" disabled={confirmText !== "ANONYMIZE" || saving} onClick={run}>
            {saving && <Loader2 className="animate-spin" />} Anonymize permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
