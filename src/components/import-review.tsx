"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Columns3, FileSpreadsheet, Loader2, Save, X } from "lucide-react";
import type { ParticipantStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { RATING_LABEL, REASON_LABEL } from "@/lib/constants";
import { FIELD_LABEL, TARGET_LABEL, mapRow, type Confidence, type FieldKey, type Mapping, type RawRow, type Target } from "@/lib/import-mapping";
import { cn } from "@/lib/utils";

export type PreviewData = {
  source: string;
  headers: string[];
  rows: RawRow[];
  mapping: Mapping;
  confidence: Record<string, Confidence>;
};

export type CommitResult = {
  saved: number;
  created: number;
  updated: number;
  sessions: number;
  flagged: number;
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
};

type Reason = keyof typeof REASON_LABEL;
type Decision = { status?: ParticipantStatus; rating?: number; reason?: Reason; details?: string };
type Existing = { id: string; firstName: string; lastName: string; status: ParticipantStatus; totalInterviews: number };

const TARGETS: Target[] = [...(Object.keys(FIELD_LABEL) as FieldKey[]), "extra", "ignore"];
const today = () => new Date().toISOString().slice(0, 10);

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  required,
}: {
  value?: T;
  required?: boolean;
  options: { value: T; label: React.ReactNode; title?: string; activeClass?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex w-fit overflow-hidden rounded-md border", required && value === undefined && "border-amber-400")}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-2.5 py-1 text-xs transition-colors hover:bg-accent [&:not(:first-child)]:border-l",
            value === o.value && (o.activeClass ?? "bg-primary text-primary-foreground hover:bg-primary/90"),
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const FLAG_OPTIONS = [
  { value: "REAL" as const, label: "จริง", activeClass: "bg-emerald-600 text-white hover:bg-emerald-600/90" },
  { value: "GEH" as const, label: "เก๊", activeClass: "bg-red-600 text-white hover:bg-red-600/90" },
];
const RATING_OPTIONS = [1, 2, 3].map((r) => ({ value: r, label: String(r), title: RATING_LABEL[r] }));

export function ImportReview({
  preview,
  onCancel,
  onSaved,
}: {
  preview: PreviewData;
  onCancel: () => void;
  onSaved: (result: CommitResult) => void;
}) {
  const [mapping, setMapping] = useState<Mapping>(preview.mapping);
  const [showMapping, setShowMapping] = useState(() => Object.values(preview.confidence).some((c) => c !== "exact"));
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [existing, setExisting] = useState<Record<string, Existing>>({});
  const [session, setSession] = useState({ projectName: "", sessionDate: today(), interviewer: "" });
  const [bulkReason, setBulkReason] = useState<{ reason: Reason | ""; details: string }>({ reason: "", details: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ph:interviewer");
      if (saved) setSession((s) => ({ ...s, interviewer: saved }));
    } catch {}
  }, []);

  const records = useMemo(() => preview.rows.map((r) => mapRow(r, mapping)), [preview.rows, mapping]);
  const phoneMapped = Object.values(mapping).includes("phone");

  // Look up which phones already exist whenever the phone column changes.
  const phonesKey = useMemo(() => [...new Set(records.map((r) => r.phone).filter((p) => p.length >= 9))].join(","), [records]);
  useEffect(() => {
    if (!phonesKey) return setExisting({});
    const ctrl = new AbortController();
    fetch("/api/import/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phones: phonesKey.split(",") }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then(setExisting)
      .catch(() => {});
    return () => ctrl.abort();
  }, [phonesKey]);

  // Per-row problems (blocking) and the first row each phone appeared in.
  const rowInfo = useMemo(() => {
    const firstSeen = new Map<string, number>();
    return records.map((rec, i) => {
      const errors = [...rec.errors];
      const match = rec.phone ? existing[rec.phone] : undefined;
      if (!rec.errors.length && !match && !rec.firstName) errors.push("New participant needs a name");
      let duplicateOf: number | undefined;
      if (rec.phone.length >= 9) {
        if (firstSeen.has(rec.phone)) duplicateOf = firstSeen.get(rec.phone);
        else firstSeen.set(rec.phone, i);
      }
      return { errors, match, duplicateOf };
    });
  }, [records, existing]);

  // Duplicate phones within the file: keep the first occurrence, exclude the rest by default.
  // Keyed on the duplicate set so a user re-including a row isn't overridden by later lookups.
  const duplicatesKey = rowInfo.flatMap((info, i) => (info.duplicateOf !== undefined ? [i] : [])).join(",");
  useEffect(() => {
    if (!duplicatesKey) return;
    setExcluded((prev) => {
      const next = new Set(prev);
      duplicatesKey.split(",").forEach((i) => next.add(Number(i)));
      return next;
    });
  }, [duplicatesKey]);

  const isIncluded = (i: number) => !excluded.has(i) && rowInfo[i].errors.length === 0;
  const included = records.map((_, i) => i).filter(isIncluded);

  const needsReason = (i: number) => decisions[i]?.status === "GEH" && rowInfo[i].match?.status !== "GEH";
  const reasonOk = (i: number) => !needsReason(i) || (!!decisions[i]?.reason && (decisions[i]?.details?.trim().length ?? 0) >= 5);

  const missingFlag = included.filter((i) => !decisions[i]?.status).length;
  const missingRating = included.filter((i) => !decisions[i]?.rating).length;
  const missingReason = included.filter((i) => !reasonOk(i)).length;
  const sessionOk = session.projectName.trim() && session.sessionDate && session.interviewer.trim();
  const canSave = phoneMapped && included.length > 0 && !missingFlag && !missingRating && !missingReason && sessionOk;

  const newCount = included.filter((i) => !rowInfo[i].match).length;
  const updateCount = included.length - newCount;
  const blocked = records.length - records.filter((_, i) => rowInfo[i].errors.length === 0).length;

  const decide = (i: number, patch: Decision) => setDecisions((d) => ({ ...d, [i]: { ...d[i], ...patch } }));
  const decideAll = (patch: Decision) =>
    setDecisions((d) => {
      const next = { ...d };
      for (const i of included) next[i] = { ...next[i], ...patch };
      return next;
    });

  const setTarget = (header: string, target: Target) => setMapping((m) => ({ ...m, [header]: target }));
  const sample = (header: string) => preview.rows.find((r) => r[header])?.[header] ?? "";

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      localStorage.setItem("ph:interviewer", session.interviewer.trim());
    } catch {}
    const res = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: preview.rows,
        mapping,
        session,
        decisions: included.map((i) => ({
          index: i,
          status: decisions[i].status,
          rating: decisions[i].rating,
          ...(needsReason(i) ? { reason: decisions[i].reason, details: decisions[i].details } : {}),
        })),
      }),
    });
    const body = await res.json().catch(() => ({ error: `Save failed (HTTP ${res.status})` }));
    setSaving(false);
    if (!res.ok) return toast.error(body.error ?? "Save failed");
    onSaved(body);
  }

  return (
    <div className="grid gap-5">
      {/* Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">{preview.source}</p>
            <p className="text-xs text-muted-foreground">
              {records.length} rows · {newCount} new · {updateCount} update existing
              {blocked > 0 && <span className="text-destructive"> · {blocked} can’t be imported</span>}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}><X /> Cancel import</Button>
      </div>

      {/* Column mapping */}
      <div className="rounded-xl border bg-card">
        <button type="button" onClick={() => setShowMapping((s) => !s)} className="flex w-full items-center justify-between gap-2 p-4 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Columns3 className="size-4" /> Column matching
            <span className="font-normal text-muted-foreground">
              · {Object.values(mapping).filter((t) => t !== "extra" && t !== "ignore").length} matched ·{" "}
              {Object.values(mapping).filter((t) => t === "extra").length} extra info
            </span>
          </span>
          <ChevronDown className={cn("size-4 transition-transform", showMapping && "rotate-180")} />
        </button>
        {!phoneMapped && (
          <p className="mx-4 mb-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="size-4" /> No column is matched to Phone. Choose the phone column below.
          </p>
        )}
        {showMapping && (
          <div className="grid gap-2 border-t p-4 sm:grid-cols-2">
            {preview.headers.map((h) => {
              const conf = preview.confidence[h];
              const t = mapping[h];
              return (
                <div key={h} className="grid gap-1 rounded-lg border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium" title={h}>{h.startsWith("__EMPTY") ? "(no header)" : h}</span>
                    {t !== "extra" && t !== "ignore" && t === preview.mapping[h] && (
                      <Badge variant={conf === "exact" ? "success" : "warning"}>{conf === "exact" ? "Matched" : "Guessed — check"}</Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">e.g. {sample(h) || "—"}</p>
                  <NativeSelect aria-label={`Import “${h}” as`} value={t} onChange={(e) => setTarget(h, e.target.value as Target)} className="h-8 text-xs">
                    {TARGETS.map((target) => <option key={target} value={target}>{TARGET_LABEL[target]}</option>)}
                  </NativeSelect>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Session details, shared by every row */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">Session details <span className="font-normal text-muted-foreground">— one research session is logged per participant with the rating you choose</span></p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Project name" htmlFor="imp-project" required>
            <Input id="imp-project" value={session.projectName} onChange={(e) => setSession({ ...session, projectName: e.target.value })} />
          </Field>
          <Field label="Session date" htmlFor="imp-date" required>
            <Input id="imp-date" type="date" value={session.sessionDate} onChange={(e) => setSession({ ...session, sessionDate: e.target.value })} />
          </Field>
          <Field label="Interviewer" htmlFor="imp-interviewer" required hint="Also recorded as the person who flags เก๊">
            <Input id="imp-interviewer" value={session.interviewer} onChange={(e) => setSession({ ...session, interviewer: e.target.value })} />
          </Field>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
        <span className="font-medium">Apply to all {included.length} selected rows:</span>
        <span className="flex items-center gap-2">Flag <Segmented label="Flag all" options={FLAG_OPTIONS} onChange={(status) => decideAll({ status })} /></span>
        <span className="flex items-center gap-2">Rating <Segmented label="Rating all" options={RATING_OPTIONS} onChange={(rating) => decideAll({ rating })} /></span>
      </div>
      {missingReason > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm dark:border-red-900 dark:bg-red-950/30 sm:flex-row sm:items-center">
          <span className="shrink-0">{missingReason} row{missingReason === 1 ? "" : "s"} flagged เก๊ need a reason:</span>
          <NativeSelect aria-label="Reason for all" value={bulkReason.reason} onChange={(e) => setBulkReason({ ...bulkReason, reason: e.target.value as Reason })} className="h-8 sm:w-48">
            <option value="" disabled>Reason</option>
            {Object.entries(REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
          <Input className="h-8 flex-1" placeholder="Details (min 5 characters)" value={bulkReason.details} onChange={(e) => setBulkReason({ ...bulkReason, details: e.target.value })} />
          <Button
            size="sm"
            variant="destructive"
            disabled={!bulkReason.reason || bulkReason.details.trim().length < 5}
            onClick={() =>
              setDecisions((d) => {
                const next = { ...d };
                for (const i of included) if (!reasonOk(i)) next[i] = { ...next[i], reason: bulkReason.reason as Reason, details: bulkReason.details };
                return next;
              })
            }
          >
            Apply to {missingReason} row{missingReason === 1 ? "" : "s"}
          </Button>
        </div>
      )}

      {/* Rows */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  className="size-4 accent-primary"
                  checked={included.length > 0 && included.length === records.filter((_, i) => rowInfo[i].errors.length === 0).length}
                  onChange={(e) =>
                    setExcluded(e.target.checked ? new Set() : new Set(records.map((_, i) => i)))
                  }
                />
              </th>
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Participant</th>
              <th className="hidden px-2 py-2 md:table-cell">Details</th>
              <th className="px-2 py-2">Flag <span className="text-destructive">*</span></th>
              <th className="px-2 py-2">Rating <span className="text-destructive">*</span></th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec, i) => {
              const info = rowInfo[i];
              const blockedRow = info.errors.length > 0;
              const on = isIncluded(i);
              const d = decisions[i] ?? {};
              const extraCount = Object.keys(rec.extra).length;
              return (
                <tr key={i} className={cn("border-b align-top last:border-0", !on && "bg-muted/40 text-muted-foreground")}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Include row ${i + 2}`}
                      className="size-4 accent-primary"
                      disabled={blockedRow}
                      checked={on}
                      onChange={(e) =>
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-2.5 tabular-nums text-muted-foreground">{i + 2}</td>
                  <td className="px-2 py-2.5">
                    <div className="font-medium">{`${rec.firstName} ${rec.lastName}`.trim() || info.match?.firstName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{rec.phone || "no phone"}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {info.match ? (
                        <>
                          <Badge variant="outline">Update existing</Badge>
                          <StatusBadge status={info.match.status} />
                        </>
                      ) : (
                        !blockedRow && <Badge variant="secondary">New</Badge>
                      )}
                    </div>
                    {info.errors.map((e) => (
                      <p key={e} className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3" /> {e}</p>
                    ))}
                    {info.duplicateOf !== undefined && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Same phone as row {info.duplicateOf + 2}</p>
                    )}
                  </td>
                  <td className="hidden max-w-72 px-2 py-2.5 md:table-cell">
                    <p className="text-xs text-muted-foreground">
                      {[rec.age !== undefined && `${rec.age}y`, rec.gender, rec.province, rec.occupation].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {rec.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">{rec.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
                    )}
                    {extraCount > 0 && (
                      <p className="mt-1 truncate text-xs text-muted-foreground" title={Object.entries(rec.extra).map(([k, v]) => `${k}: ${v}`).join("\n")}>
                        + {Object.entries(rec.extra).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    {on && (
                      <div className="grid gap-1.5">
                        <Segmented required label={`Flag row ${i + 2}`} value={d.status} options={FLAG_OPTIONS} onChange={(status) => decide(i, { status })} />
                        {info.match?.status === "GEH" && d.status === "REAL" && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400">Will restore to จริง</p>
                        )}
                        {needsReason(i) && (
                          <div className="grid w-52 gap-1">
                            <NativeSelect aria-label={`Reason row ${i + 2}`} value={d.reason ?? ""} onChange={(e) => decide(i, { reason: e.target.value as Reason })} className="h-8 text-xs">
                              <option value="" disabled>Reason *</option>
                              {Object.entries(REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </NativeSelect>
                            <Input aria-label={`Details row ${i + 2}`} className="h-8 text-xs" placeholder="Details * (min 5)" value={d.details ?? ""} onChange={(e) => decide(i, { details: e.target.value })} />
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    {on && (
                      <div className="grid gap-1">
                        <Segmented required label={`Rating row ${i + 2}`} value={d.rating} options={RATING_OPTIONS} onChange={(rating) => decide(i, { rating })} />
                        {d.rating && <span className="text-[11px] text-muted-foreground">{RATING_LABEL[d.rating]}</span>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          {canSave ? (
            <span className="text-emerald-700 dark:text-emerald-400">Ready to save {included.length} participant{included.length === 1 ? "" : "s"}.</span>
          ) : (
            <span className="text-muted-foreground">
              {[
                !phoneMapped && "match a Phone column",
                included.length === 0 && "select at least one row",
                missingFlag > 0 && `flag ${missingFlag} row${missingFlag === 1 ? "" : "s"}`,
                missingRating > 0 && `rate ${missingRating} row${missingRating === 1 ? "" : "s"}`,
                missingReason > 0 && `add a เก๊ reason for ${missingReason} row${missingReason === 1 ? "" : "s"}`,
                !sessionOk && "fill in session details",
              ]
                .filter(Boolean)
                .join(" · ")
                .replace(/^./, (c) => `To save: ${c}`)}
            </span>
          )}
        </div>
        <Button onClick={save} disabled={!canSave || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save {included.length} participant{included.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
