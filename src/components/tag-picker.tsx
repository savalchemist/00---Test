"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VISIBLE = 16;

/**
 * All tags shown as selectable chips. Selection is staged locally and applied
 * only when the user presses Search, so several tags can be combined first.
 */
export function TagPicker({
  allTags,
  applied,
  appliedMode,
  onApply,
}: {
  allTags: { tag: string; count: number }[];
  applied: string[];
  appliedMode: "AND" | "OR";
  onApply: (tags: string[], mode: "AND" | "OR") => void;
}) {
  const [selected, setSelected] = useState<string[]>(applied);
  const [mode, setMode] = useState<"AND" | "OR">(appliedMode);
  const [find, setFind] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Re-sync when filters change elsewhere (URL, suggestions, "Clear all").
  const appliedKey = applied.join("\u0000") + appliedMode;
  useEffect(() => {
    setSelected(applied);
    setMode(appliedMode);
  }, [appliedKey]);

  const dirty = selected.join("\u0000") !== applied.join("\u0000") || (selected.length > 1 && mode !== appliedMode);

  const visible = useMemo(() => {
    const needle = find.trim().toLowerCase();
    const matches = needle ? allTags.filter((t) => t.tag.toLowerCase().includes(needle)) : allTags;
    if (needle || showAll) return matches;
    // Always keep selected tags visible even if they're outside the top list.
    const top = matches.slice(0, VISIBLE);
    const extra = matches.filter((t) => selected.includes(t.tag) && !top.includes(t));
    return [...top, ...extra];
  }, [allTags, find, showAll, selected]);

  const toggle = (tag: string) => setSelected((s) => (s.includes(tag) ? s.filter((t) => t !== tag) : [...s, tag]));

  if (!allTags.length) return null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tag className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Search by tag</span>
        {allTags.length > VISIBLE && (
          <div className="relative ml-auto w-full sm:w-48">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Find a tag…"
              aria-label="Find a tag"
              className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visible.map((t) => {
          const on = selected.includes(t.tag);
          return (
            <button
              key={t.tag}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(t.tag)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent",
                on && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {on && <Check className="size-3" />}
              {t.tag}
              <span className={cn("tabular-nums", on ? "opacity-70" : "text-muted-foreground")}>{t.count}</span>
            </button>
          );
        })}
        {!find && allTags.length > VISIBLE && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="rounded-full px-2.5 py-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
            {showAll ? "Show less" : `Show all ${allTags.length}`}
          </button>
        )}
        {find && visible.length === 0 && <span className="text-xs text-muted-foreground">No tags match “{find}”.</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        {selected.length > 1 && (
          <div className="flex items-center gap-2 text-xs">
            Match
            <div className="inline-flex overflow-hidden rounded-md border">
              {(["AND", "OR"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn("px-2.5 py-1", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
                >
                  {m}
                </button>
              ))}
            </div>
            <span className="text-muted-foreground">{mode === "AND" ? "all selected tags" : "any selected tag"}</span>
          </div>
        )}
        {selected.length === 0 && <span className="text-xs text-muted-foreground">Select one or more tags, then press Search.</span>}
        <div className="ml-auto flex gap-2">
          {(selected.length > 0 || applied.length > 0) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected([]);
                if (applied.length) onApply([], mode);
              }}
            >
              <X /> Clear tags
            </Button>
          )}
          <Button type="button" size="sm" disabled={!dirty} onClick={() => onApply(selected, mode)}>
            <Search /> Search{selected.length ? ` (${selected.length})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
