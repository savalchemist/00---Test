"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, SlidersHorizontal, X } from "lucide-react";
import type { ParticipantStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { TagInput } from "@/components/tag-input";
import { SearchSuggest } from "@/components/search-suggest";
import { TagPicker } from "@/components/tag-picker";
import { RATING_LABEL } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  age: number | null;
  gender: string | null;
  occupation: string | null;
  province: string | null;
  tags: string[];
  status: ParticipantStatus;
  totalInterviews: number;
  lastSessionDate: string | null;
  anonymizedAt: string | null;
};

type Filters = {
  q: string;
  status: string;
  tags: string[];
  tagMode: "AND" | "OR";
  ageMin: string;
  ageMax: string;
  gender: string[];
  province: string[];
  occupation: string;
  rating: string[];
  sessionsMin: string;
  sessionsMax: string;
  lastFrom: string;
  lastTo: string;
  never: boolean;
  pdpa: string;
  sort: string;
  page: number;
};

const csv = (sp: URLSearchParams, k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : []);

function fromParams(sp: URLSearchParams): Filters {
  return {
    q: sp.get("q") ?? "",
    status: sp.get("status") ?? "",
    tags: csv(sp, "tags"),
    tagMode: sp.get("tagMode") === "OR" ? "OR" : "AND",
    ageMin: sp.get("ageMin") ?? "",
    ageMax: sp.get("ageMax") ?? "",
    gender: csv(sp, "gender"),
    province: csv(sp, "province"),
    occupation: sp.get("occupation") ?? "",
    rating: csv(sp, "rating"),
    sessionsMin: sp.get("sessionsMin") ?? "",
    sessionsMax: sp.get("sessionsMax") ?? "",
    lastFrom: sp.get("lastFrom") ?? "",
    lastTo: sp.get("lastTo") ?? "",
    never: sp.get("never") === "1",
    pdpa: sp.get("pdpa") ?? "",
    sort: sp.get("sort") ?? "",
    page: Number(sp.get("page")) || 1,
  };
}

function toParams(f: Filters) {
  const sp = new URLSearchParams();
  const put = (k: string, v: string | string[] | boolean | number) => {
    const s = Array.isArray(v) ? v.join(",") : typeof v === "boolean" ? (v ? "1" : "") : String(v);
    if (s) sp.set(k, s);
  };
  put("q", f.q.trim());
  put("status", f.status);
  put("tags", f.tags);
  if (f.tags.length > 1) put("tagMode", f.tagMode);
  put("ageMin", f.ageMin);
  put("ageMax", f.ageMax);
  put("gender", f.gender);
  put("province", f.province);
  put("occupation", f.occupation.trim());
  put("rating", f.rating);
  put("sessionsMin", f.sessionsMin);
  put("sessionsMax", f.sessionsMax);
  if (f.never) put("never", true);
  else {
    put("lastFrom", f.lastFrom);
    put("lastTo", f.lastTo);
  }
  put("pdpa", f.pdpa);
  put("sort", f.sort);
  if (f.page > 1) put("page", f.page);
  return sp;
}

function countActive(f: Filters) {
  return [
    f.status, f.ageMin || f.ageMax, f.gender.length, f.province.length, f.occupation,
    f.rating.length, f.sessionsMin || f.sessionsMax, f.never || f.lastFrom || f.lastTo, f.pdpa,
  ].filter(Boolean).length;
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-2 rounded-lg border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent",
        active && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      {children}
    </button>
  );
}

export function ParticipantSearch({
  allTags,
  provinces,
  genders,
}: {
  allTags: { tag: string; count: number }[];
  provinces: string[];
  genders: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();

  const [f, setF] = useState<Filters>(() => fromParams(new URLSearchParams(urlKey)));
  const [data, setData] = useState<{ total: number; pageSize: number; data: Row[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const update = (patch: Partial<Filters>) => setF((s) => ({ ...s, page: 1, ...patch }));

  // Sync local filter state → URL (debounced so typing doesn't spam history).
  const nextKey = useMemo(() => toParams(f).toString(), [f]);
  const pushedKey = useRef(urlKey);
  useEffect(() => {
    if (nextKey === urlKey) return;
    const t = setTimeout(() => {
      pushedKey.current = nextKey;
      router.replace(nextKey ? `${pathname}?${nextKey}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [nextKey, urlKey, pathname, router]);

  // URL changed by something other than this component (nav link, global search) → reset local state.
  useEffect(() => {
    if (urlKey !== pushedKey.current) {
      pushedKey.current = urlKey;
      setF(fromParams(new URLSearchParams(urlKey)));
    }
  }, [urlKey]);

  // URL → results.
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/participants?${urlKey}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [urlKey]);

  const active = countActive(f);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const genderOptions = [...new Set([...genders, "Male", "Female"])];

  // Close the filter panel on outside click or Esc.
  const filterWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showFilters) return;
    const onDown = (e: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) setShowFilters(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowFilters(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showFilters]);

  const clearFilters = () =>
    setF({ ...fromParams(new URLSearchParams()), q: f.q, sort: f.sort, tags: f.tags, tagMode: f.tagMode });

  // Compact summary of applied filters (tags are shown in the tag picker instead).
  const chips: { label: string; clear: () => void }[] = [];
  if (f.status) chips.push({ label: f.status === "REAL" ? "🟢 จริง" : "🔴 เก๊", clear: () => update({ status: "" }) });
  if (f.ageMin || f.ageMax) chips.push({ label: `Age ${f.ageMin || "any"}–${f.ageMax || "any"}`, clear: () => update({ ageMin: "", ageMax: "" }) });
  f.gender.forEach((g) => chips.push({ label: g, clear: () => update({ gender: f.gender.filter((x) => x !== g) }) }));
  f.province.forEach((p) => chips.push({ label: p, clear: () => update({ province: f.province.filter((x) => x !== p) }) }));
  if (f.occupation) chips.push({ label: `Occupation: ${f.occupation}`, clear: () => update({ occupation: "" }) });
  if (f.rating.length) chips.push({ label: `Rating ${[...f.rating].sort().reverse().join(", ")}`, clear: () => update({ rating: [] }) });
  if (f.sessionsMin || f.sessionsMax) chips.push({ label: `Sessions ${f.sessionsMin || "0"}–${f.sessionsMax || "any"}`, clear: () => update({ sessionsMin: "", sessionsMax: "" }) });
  if (f.never) chips.push({ label: "Never interviewed", clear: () => update({ never: false }) });
  if (!f.never && (f.lastFrom || f.lastTo)) {
    const label = f.lastFrom && f.lastTo ? `Last interview ${f.lastFrom} → ${f.lastTo}` : f.lastFrom ? `Last interview after ${f.lastFrom}` : `Last interview before ${f.lastTo}`;
    chips.push({ label, clear: () => update({ lastFrom: "", lastTo: "" }) });
  }
  if (f.pdpa) chips.push({ label: f.pdpa === "yes" ? "PDPA signed" : "PDPA not signed", clear: () => update({ pdpa: "" }) });

  const filters = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Section title="Status">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!f.status} onClick={() => update({ status: "" })}>All</Chip>
          <Chip active={f.status === "REAL"} onClick={() => update({ status: "REAL" })}>🟢 จริง</Chip>
          <Chip active={f.status === "GEH"} onClick={() => update({ status: "GEH" })}>🔴 เก๊</Chip>
        </div>
      </Section>

      <Section title="PDPA consent">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!f.pdpa} onClick={() => update({ pdpa: "" })}>Any</Chip>
          <Chip active={f.pdpa === "yes"} onClick={() => update({ pdpa: "yes" })}>Signed</Chip>
          <Chip active={f.pdpa === "no"} onClick={() => update({ pdpa: "no" })}>Not signed</Chip>
        </div>
      </Section>

      <Section title="Past behavior rating">
        <div className="grid gap-1.5">
          {[3, 2, 1].map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={f.rating.includes(String(r))} onChange={() => update({ rating: toggle(f.rating, String(r)) })} />
              <span className="font-medium">{r}</span>
              <span className="truncate text-muted-foreground">{RATING_LABEL[r]}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Demographics">
        <div className="flex items-center gap-2">
          <Input type="number" min={0} placeholder="Age min" value={f.ageMin} onChange={(e) => update({ ageMin: e.target.value })} />
          <span className="text-muted-foreground">–</span>
          <Input type="number" min={0} placeholder="Age max" value={f.ageMax} onChange={(e) => update({ ageMax: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {genderOptions.map((g) => (
            <Chip key={g} active={f.gender.includes(g)} onClick={() => update({ gender: toggle(f.gender, g) })}>{g}</Chip>
          ))}
        </div>
      </Section>

      <Section title="Location & occupation">
        <TagInput value={f.province} onChange={(province) => update({ province })} suggestions={provinces} placeholder="Province…" />
        <Input placeholder="Occupation contains…" value={f.occupation} onChange={(e) => update({ occupation: e.target.value })} />
      </Section>

      <Section title="Sessions & recency">
        <div className="flex items-center gap-2">
          <Input type="number" min={0} placeholder="Min sessions" value={f.sessionsMin} onChange={(e) => update({ sessionsMin: e.target.value })} />
          <span className="text-muted-foreground">–</span>
          <Input type="number" min={0} placeholder="Max" value={f.sessionsMax} onChange={(e) => update({ sessionsMax: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={f.never} onChange={(e) => update({ never: e.target.checked })} />
          Never interviewed
        </label>
        {!f.never && (
          <div className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">Last interview between</span>
            <div className="grid gap-2">
              <Input type="date" aria-label="Last interview from" value={f.lastFrom} onChange={(e) => update({ lastFrom: e.target.value })} />
              <Input type="date" aria-label="Last interview to" value={f.lastTo} onChange={(e) => update({ lastTo: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-1">
              {[3, 6, 12].map((m) => {
                const d = new Date();
                d.setMonth(d.getMonth() - m);
                const iso = d.toISOString().slice(0, 10);
                return (
                  <button key={m} type="button" onClick={() => update({ lastFrom: "", lastTo: iso })} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                    Not in last {m}m
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Section>
    </div>
  );

  return (
    <div className="grid min-w-0 gap-4">
      <div ref={filterWrapRef} className="relative">
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchSuggest
            value={f.q}
            onChange={(q) => update({ q })}
            onPickTag={(tag) => update({ q: "", tags: f.tags.includes(tag) ? f.tags : [...f.tags, tag] })}
            onPickProvince={(p) => update({ q: "", province: f.province.includes(p) ? f.province : [...f.province, p] })}
            onPickOccupation={(o) => update({ q: "", occupation: o })}
          />
          <div className="flex gap-2">
            <Button
              variant={showFilters || active ? "default" : "outline"}
              aria-expanded={showFilters}
              onClick={() => setShowFilters((s) => !s)}
            >
              <SlidersHorizontal /> Filters{active ? ` (${active})` : ""}
            </Button>
            <NativeSelect aria-label="Sort" value={f.sort} onChange={(e) => update({ sort: e.target.value })} className="w-44">
              <option value="">Recently updated</option>
              <option value="recent">Last interviewed</option>
              <option value="sessions">Most sessions</option>
              <option value="name">Name A–Z</option>
            </NativeSelect>
          </div>
        </div>

        {showFilters && (
          <div
            role="dialog"
            aria-label="Filters"
            className="absolute right-0 top-full z-30 mt-2 w-full max-w-4xl rounded-xl border bg-card p-4 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Filters</span>
              <div className="flex items-center gap-1">
                {active > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button>
                )}
                <Button variant="ghost" size="icon" aria-label="Close filters" onClick={() => setShowFilters(false)}>
                  <X />
                </Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto pr-1">{filters}</div>
            <div className="mt-3 flex justify-end border-t pt-3">
              <Button size="sm" onClick={() => setShowFilters(false)}>
                {loading ? <Loader2 className="animate-spin" /> : null}
                Show {data ? data.total.toLocaleString() : ""} result{data?.total === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pl-2.5 pr-1 text-xs">
              {c.label}
              <button type="button" aria-label={`Remove ${c.label}`} onClick={c.clear} className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={clearFilters} className="ml-1 text-xs text-muted-foreground hover:text-foreground">
            Clear all
          </button>
        </div>
      )}

      <TagPicker
        allTags={allTags}
        applied={f.tags}
        appliedMode={f.tagMode}
        onApply={(tags, tagMode) => update({ tags, tagMode })}
      />

      <section className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          {loading && <Loader2 className="size-4 animate-spin" />}
          {data && <span>{data.total.toLocaleString()} participant{data.total === 1 ? "" : "s"}</span>}
          {f.tags.length > 0 && (
            <span className="truncate">
              · tagged {f.tags.map((t) => `“${t}”`).join(f.tagMode === "AND" ? " AND " : " OR ")}
            </span>
          )}
        </div>

        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Participant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Demographics</TableHead>
                <TableHead className="hidden lg:table-cell">Tags</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="hidden sm:table-cell">Last interview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/participants/${p.id}`)}>
                  <TableCell>
                    <Link href={`/participants/${p.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {p.anonymizedAt ? <span className="italic text-muted-foreground">Anonymized</span> : `${p.firstName} ${p.lastName}`}
                    </Link>
                    {!p.anonymizedAt && <div className="text-xs text-muted-foreground">{p.phone}</div>}
                  </TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {[p.age && `${p.age}y`, p.gender, p.province, p.occupation].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {p.tags.slice(0, 3).map((t) => (
                        <Badge key={t} variant={f.tags.includes(t) ? "default" : "secondary"}>{t}</Badge>
                      ))}
                      {p.tags.length > 3 && <Badge variant="outline">+{p.tags.length - 3}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.totalInterviews}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(p.lastSessionDate)}</TableCell>
                </TableRow>
              ))}
              {data && data.data.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No participants match these filters.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {data && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">Page {f.page} of {totalPages}</span>
            <Button variant="outline" size="icon" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })} aria-label="Previous page"><ChevronLeft /></Button>
            <Button variant="outline" size="icon" disabled={f.page >= totalPages} onClick={() => setF({ ...f, page: f.page + 1 })} aria-label="Next page"><ChevronRight /></Button>
          </div>
        )}
      </section>
    </div>
  );
}
