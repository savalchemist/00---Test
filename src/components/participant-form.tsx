"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/field";
import { TagInput } from "@/components/tag-input";
import { GENDER_OPTIONS, INCOME_OPTIONS } from "@/lib/constants";

export type ParticipantFormValues = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  lineId: string;
  age: string;
  gender: string;
  occupation: string;
  monthlyIncome: string;
  province: string;
  tags: string[];
  pdpaConsentSigned: boolean;
  pdpaSignedDate: string;
  extraFields: { key: string; value: string }[];
};

const EMPTY: ParticipantFormValues = {
  firstName: "", lastName: "", phone: "", email: "", lineId: "", age: "", gender: "",
  occupation: "", monthlyIncome: "", province: "", tags: [], pdpaConsentSigned: false, pdpaSignedDate: "",
  extraFields: [],
};

export function ParticipantForm({
  participantId,
  initial,
  tagSuggestions = [],
}: {
  participantId?: string;
  initial?: Partial<ParticipantFormValues>;
  tagSuggestions?: string[];
}) {
  const router = useRouter();
  const [v, setV] = useState<ParticipantFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; status: string } | null>(null);
  const set = <K extends keyof ParticipantFormValues>(k: K, val: ParticipantFormValues[K]) => setV((s) => ({ ...s, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setDuplicate(null);
    const res = await fetch(participantId ? `/api/participants/${participantId}` : "/api/participants", {
      method: participantId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...v,
        age: v.age === "" ? null : Number(v.age),
        pdpaSignedDate: v.pdpaConsentSigned && v.pdpaSignedDate ? v.pdpaSignedDate : null,
        extraFields: Object.fromEntries(v.extraFields.filter((e) => e.key.trim() && e.value.trim()).map((e) => [e.key.trim(), e.value.trim()])),
      }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) {
      if (res.status === 409 && body.participantId) setDuplicate({ id: body.participantId, status: body.status });
      toast.error(body.error ?? "Could not save");
      return;
    }
    toast.success(participantId ? "Profile updated" : "Participant added");
    router.push(`/participants/${body.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      {duplicate && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          This phone number is already registered{duplicate.status === "GEH" ? " — and flagged as เก๊" : ""}.{" "}
          <Link className="font-medium underline" href={`/participants/${duplicate.id}`}>Open existing profile</Link>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" required>
          <Input id="firstName" required value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <Input id="lastName" value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor="phone" required hint="Used for duplicate checks">
          <Input id="phone" required inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08x-xxx-xxxx" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="LINE ID" htmlFor="lineId">
          <Input id="lineId" value={v.lineId} onChange={(e) => set("lineId", e.target.value)} />
        </Field>
      </section>

      <section className="grid gap-4 border-t pt-6 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Age" htmlFor="age">
          <Input id="age" type="number" min={0} max={120} value={v.age} onChange={(e) => set("age", e.target.value)} />
        </Field>
        <Field label="Gender" htmlFor="gender">
          <NativeSelect id="gender" value={v.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">—</option>
            {[...new Set([...GENDER_OPTIONS, ...(v.gender ? [v.gender] : [])])].map((g) => <option key={g}>{g}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Province" htmlFor="province">
          <Input id="province" value={v.province} onChange={(e) => set("province", e.target.value)} placeholder="e.g. Bangkok" />
        </Field>
        <Field label="Occupation" htmlFor="occupation">
          <Input id="occupation" value={v.occupation} onChange={(e) => set("occupation", e.target.value)} />
        </Field>
        <Field label="Monthly income (THB)" htmlFor="monthlyIncome">
          <NativeSelect id="monthlyIncome" value={v.monthlyIncome} onChange={(e) => set("monthlyIncome", e.target.value)}>
            <option value="">—</option>
            {[...new Set([...INCOME_OPTIONS, ...(v.monthlyIncome ? [v.monthlyIncome] : [])])].map((i) => <option key={i}>{i}</option>)}
          </NativeSelect>
        </Field>
      </section>

      <section className="grid gap-4 border-t pt-6">
        <Field label="Tags" hint="e.g. SME Owner, iPhone User, Online Shopper">
          <TagInput value={v.tags} onChange={(t) => set("tags", t)} suggestions={tagSuggestions} />
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={v.pdpaConsentSigned} onChange={(e) => set("pdpaConsentSigned", e.target.checked)} />
            PDPA consent signed
          </label>
          {v.pdpaConsentSigned && (
            <Input type="date" aria-label="PDPA signed date" className="sm:w-48" value={v.pdpaSignedDate} onChange={(e) => set("pdpaSignedDate", e.target.value)} />
          )}
        </div>
      </section>

      <section className="grid gap-3 border-t pt-6">
        <div>
          <p className="text-sm font-medium">ข้อมูลเพิ่มเติม (Extra info)</p>
          <p className="text-xs text-muted-foreground">Anything not covered above, e.g. car model or bank used. Imported columns that aren&apos;t in the template appear here.</p>
        </div>
        {v.extraFields.map((row, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={`Extra info ${i + 1} label`}
              placeholder="Label"
              className="w-2/5"
              value={row.key}
              onChange={(e) => set("extraFields", v.extraFields.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
            />
            <Input
              aria-label={`Extra info ${i + 1} value`}
              placeholder="Value"
              value={row.value}
              onChange={(e) => set("extraFields", v.extraFields.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
            />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove extra info ${i + 1}`} onClick={() => set("extraFields", v.extraFields.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => set("extraFields", [...v.extraFields, { key: "", value: "" }])}>
            <Plus /> Add field
          </Button>
        </div>
      </section>

      <div className="flex gap-2 border-t pt-6">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {participantId ? "Save changes" : "Add participant"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
