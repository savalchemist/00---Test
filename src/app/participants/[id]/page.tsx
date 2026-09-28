import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertOctagon, ArrowLeft, Mail, MessageCircle, Pencil, Phone, ShieldCheck, ShieldOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { fullName, parseExtra, parseTags } from "@/lib/participant";
import { REASON_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RatingBadge, StatusBadge } from "@/components/status-badge";
import { AnonymizeDialog, FlagDialog, LogSessionDialog, ReinstateButton } from "@/components/profile-actions";

export const dynamic = "force-dynamic";

export default async function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.participant.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { sessionDate: "desc" } },
      blacklistRecords: { orderBy: { flaggedAt: "desc" } },
    },
  });
  if (!p) notFound();

  const tags = parseTags(p.tags);
  const extra = Object.entries(parseExtra(p.extraFields));
  const name = fullName(p);
  const avgRating = p.sessions.length ? p.sessions.reduce((s, x) => s + x.behaviorRating, 0) / p.sessions.length : null;

  const demographics: [string, string | number | null][] = [
    ["Age", p.age],
    ["Gender", p.gender],
    ["Province", p.province],
    ["Occupation", p.occupation],
    ["Monthly income", p.monthlyIncome],
  ];

  return (
    <div className="grid gap-6">
      <Link href="/participants" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Participants
      </Link>

      {p.status === "GEH" && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertOctagon className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Flagged as เก๊ — do not recruit</p>
            {p.blacklistRecords[0] && (
              <p className="mt-0.5">
                {REASON_LABEL[p.blacklistRecords[0].reason]}: {p.blacklistRecords[0].details}{" "}
                <span className="opacity-70">— {p.blacklistRecords[0].flaggedBy}, {formatDate(p.blacklistRecords[0].flaggedAt)}</span>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={`text-2xl font-semibold tracking-tight ${p.anonymizedAt ? "italic text-muted-foreground" : ""}`}>{name}</h1>
            <StatusBadge status={p.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {p.totalInterviews} session{p.totalInterviews === 1 ? "" : "s"} · last {formatDate(p.lastSessionDate)} · added {formatDate(p.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LogSessionDialog participantId={p.id} />
          {!p.anonymizedAt && (
            <Button asChild variant="outline">
              <Link href={`/participants/${p.id}/edit`}><Pencil /> Edit</Link>
            </Button>
          )}
          {p.status === "REAL" ? <FlagDialog participantId={p.id} name={name} /> : <ReinstateButton participantId={p.id} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
            <CardContent className="grid gap-2.5 text-sm">
              {p.anonymizedAt ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <ShieldOff className="size-4" /> PII removed on {formatDate(p.anonymizedAt)}
                </p>
              ) : (
                <>
                  <p className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" /> {p.phone}</p>
                  <p className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground" /> {p.email ?? "—"}</p>
                  <p className="flex items-center gap-2"><MessageCircle className="size-4 text-muted-foreground" /> {p.lineId ?? "—"}</p>
                </>
              )}
              <p className="flex items-center gap-2 border-t pt-2.5">
                <ShieldCheck className={`size-4 ${p.pdpaConsentSigned ? "text-emerald-600" : "text-muted-foreground"}`} />
                {p.pdpaConsentSigned ? `PDPA consent signed ${formatDate(p.pdpaSignedDate)}` : "PDPA consent not signed"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Demographics</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {demographics.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Tags</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {tags.length ? (
                tags.map((t) => (
                  <Link key={t} href={`/participants?tags=${encodeURIComponent(t)}`}>
                    <Badge variant="secondary" className="hover:bg-accent">{t}</Badge>
                  </Link>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No tags</span>
              )}
            </CardContent>
          </Card>

          {extra.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">ข้อมูลเพิ่มเติม</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  {extra.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          {!p.anonymizedAt && (
            <div>
              <AnonymizeDialog participantId={p.id} />
            </div>
          )}
        </div>

        <div className="grid content-start gap-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Session timeline</CardTitle>
              {avgRating !== null && <span className="text-xs text-muted-foreground">Avg. rating {avgRating.toFixed(1)} / 3</span>}
            </CardHeader>
            <CardContent>
              {p.sessions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No sessions yet.</p>
              ) : (
                <ol className="relative ml-2 border-l">
                  {p.sessions.map((s) => (
                    <li key={s.id} className="mb-6 ml-5 last:mb-0">
                      <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.projectName}</span>
                        <RatingBadge rating={s.behaviorRating} />
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(s.sessionDate)} · Interviewer: {s.interviewer}</p>
                      {s.keyTakeaways && <p className="mt-2 whitespace-pre-line text-sm">{s.keyTakeaways}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {p.blacklistRecords.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Flag history</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                {p.blacklistRecords.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="danger">{REASON_LABEL[r.reason]}</Badge>
                      <span className="text-xs text-muted-foreground">{r.flaggedBy} · {formatDate(r.flaggedAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line">{r.details}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
