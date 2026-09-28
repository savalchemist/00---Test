"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Briefcase, MapPin, Search, Tag, User, X } from "lucide-react";
import type { ParticipantStatus } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

type Suggestions = {
  participants: { id: string; firstName: string; lastName: string; phone: string; status: ParticipantStatus; occupation: string | null; province: string | null }[];
  tags: { tag: string; count: number }[];
  provinces: { value: string; count: number }[];
  occupations: { value: string; count: number }[];
};

type Item =
  | { kind: "text"; label: string }
  | { kind: "participant"; label: string; id: string; sub: string; status: ParticipantStatus }
  | { kind: "tag" | "province" | "occupation"; label: string; count: number };

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const GROUP_LABEL: Record<Item["kind"], string> = {
  text: "",
  participant: "Participants",
  tag: "Tags",
  province: "Provinces",
  occupation: "Occupations",
};

const ICON = { participant: User, tag: Tag, province: MapPin, occupation: Briefcase } as const;

/**
 * Search box with Google-style suggestions. Typing still filters the table live (via `onChange`);
 * picking a suggestion jumps to a profile or applies it as a filter.
 */
export function SearchSuggest({
  value,
  onChange,
  onPickTag,
  onPickProvince,
  onPickOccupation,
}: {
  value: string;
  onChange: (q: string) => void;
  onPickTag: (tag: string) => void;
  onPickProvince: (province: string) => void;
  onPickOccupation: (occupation: string) => void;
}) {
  const router = useRouter();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggestions | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const q = value.trim();

  useEffect(() => {
    if (!q) return setData(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: Suggestions) => {
          setData(d);
          setActiveIndex(-1);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const items: Item[] = [];
  if (q) {
    items.push({ kind: "text", label: q });
    data?.participants.forEach((p) =>
      items.push({
        kind: "participant",
        id: p.id,
        label: `${p.firstName} ${p.lastName}`.trim(),
        sub: [p.phone, p.occupation, p.province].filter(Boolean).join(" · "),
        status: p.status,
      }),
    );
    data?.tags.forEach((t) => items.push({ kind: "tag", label: t.tag, count: t.count }));
    data?.provinces.forEach((p) => items.push({ kind: "province", label: p.value, count: p.count }));
    data?.occupations.forEach((o) => items.push({ kind: "occupation", label: o.value, count: o.count }));
  }

  function pick(item: Item) {
    setOpen(false);
    setActiveIndex(-1);
    switch (item.kind) {
      case "text":
        return; // text is already applied live
      case "participant":
        return router.push(`/participants/${item.id}`);
      case "tag":
        return onPickTag(item.label);
      case "province":
        return onPickProvince(item.label);
      case "occupation":
        return onPickOccupation(item.label);
    }
  }

  const showList = open && items.length > 0;

  return (
    <div ref={wrapRef} className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        className="pl-9 pr-8"
        placeholder="Search name, phone, email, LINE ID, tag, province…"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => (i + 1) % Math.max(items.length, 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (showList && activeIndex >= 0) pick(items[activeIndex]);
            else setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border bg-card py-1 shadow-lg"
        >
          {items.map((item, i) => {
            const header = item.kind !== "text" && (i === 0 || items[i - 1].kind !== item.kind);
            const Icon = item.kind === "text" ? Search : ICON[item.kind];
            return (
              <li key={`${item.kind}-${item.label}-${i}`} role="presentation">
                {header && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{GROUP_LABEL[item.kind]}</p>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => pick(item)}
                  className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm", i === activeIndex && "bg-accent")}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  {item.kind === "text" ? (
                    <span className="truncate text-muted-foreground">
                      Search for “<span className="text-foreground">{item.label}</span>”
                    </span>
                  ) : item.kind === "participant" ? (
                    <>
                      <span className="min-w-0 flex-1 truncate">
                        <Highlight text={item.label} q={q} />
                        <span className="ml-2 text-xs text-muted-foreground"><Highlight text={item.sub} q={q} /></span>
                      </span>
                      <StatusBadge status={item.status} />
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate"><Highlight text={item.label} q={q} /></span>
                      <span className="text-xs text-muted-foreground">
                        {item.kind === "tag" ? "Add tag" : "Filter"} · {item.count}
                      </span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
