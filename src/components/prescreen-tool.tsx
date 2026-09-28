"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import type { ParticipantStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

type Match = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: ParticipantStatus;
  totalInterviews: number;
  lastSessionDate: string | null;
  anonymizedAt: string | null;
};
type Result = { input: string; type: "phone" | "name"; matches: Match[] };

function verdict(r: Result): { label: string; variant: "success" | "danger" | "warning" | "secondary" } {
  if (!r.matches.length) return { label: "New — not in database", variant: "secondary" };
  if (r.matches.some((m) => m.status === "GEH")) return { label: "Do not recruit", variant: "danger" };
  if (r.matches.length > 1) return { label: "Multiple matches — check", variant: "warning" };
  return { label: "OK to recruit", variant: "success" };
}

export function PrescreenTool() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  async function check() {
    const entries = [...new Set(text.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean))];
    if (!entries.length) return toast.error("Paste at least one phone number or name");
    setLoading(true);
    const res = await fetch("/api/prescreen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.error ?? "Check failed");
    setResults(json.results);
  }

  const counts = results && {
    geh: results.filter((r) => r.matches.some((m) => m.status === "GEH")).length,
    fresh: results.filter((r) => !r.matches.length).length,
  };

  function copyClean() {
    if (!results) return;
    const ok = results.filter((r) => !r.matches.some((m) => m.status === "GEH")).map((r) => r.input);
    navigator.clipboard.writeText(ok.join("\n")).then(() => toast.success(`Copied ${ok.length} entries without เก๊`));
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Paste one per line — phone numbers or names\n0812345678\n089-876-5432\nSomchai Jaidee"}
          className="font-mono text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={check} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <ScanSearch />} Check status
          </Button>
          {results && (
            <Button variant="outline" onClick={copyClean}><Copy /> Copy list without เก๊</Button>
          )}
        </div>
      </div>

      {results && counts && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">{results.length} checked</Badge>
            <Badge variant="danger">{counts.geh} เก๊</Badge>
            <Badge variant="secondary">{counts.fresh} new</Badge>
          </div>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Input</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="hidden sm:table-cell">Last interview</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => {
                  const v = verdict(r);
                  const rows = r.matches.length ? r.matches : [null];
                  return rows.map((m, j) => (
                    <TableRow key={`${i}-${j}`} className={r.matches.some((x) => x.status === "GEH") ? "bg-red-50/60 dark:bg-red-950/20" : ""}>
                      <TableCell className="font-mono text-xs">{j === 0 ? r.input : ""}</TableCell>
                      <TableCell>{j === 0 && <Badge variant={v.variant}>{v.label}</Badge>}</TableCell>
                      <TableCell>
                        {m ? (
                          <Link href={`/participants/${m.id}`} className="hover:underline">
                            {m.anonymizedAt ? "Anonymized" : `${m.firstName} ${m.lastName}`}
                            {!m.anonymizedAt && <span className="ml-1 text-xs text-muted-foreground">{m.phone}</span>}
                          </Link>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{m && <StatusBadge status={m.status} />}</TableCell>
                      <TableCell className="text-right tabular-nums">{m?.totalInterviews ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{m ? formatDate(m.lastSessionDate) : "—"}</TableCell>
                    </TableRow>
                  ));
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
