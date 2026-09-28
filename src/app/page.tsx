import Link from "next/link";
import { CircleCheck, CircleX, Download, FileUp, MessagesSquare, ScanSearch, UserPlus, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getStats } from "@/lib/stats";
import { fullName } from "@/lib/participant";
import { REASON_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/global-search";
import { RatingBadge, StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, recentSessions, recentFlags] = await Promise.all([
    getStats(),
    prisma.researchSession.findMany({
      orderBy: { sessionDate: "desc" },
      take: 6,
      include: { participant: { select: { id: true, firstName: true, lastName: true, anonymizedAt: true, status: true } } },
    }),
    prisma.blacklistRecord.findMany({
      orderBy: { flaggedAt: "desc" },
      take: 5,
      include: { participant: { select: { id: true, firstName: true, lastName: true, anonymizedAt: true } } },
    }),
  ]);

  const cards = [
    { label: "Total participants", value: stats.total, icon: Users, href: "/participants" },
    { label: "จริง · Active", value: stats.real, icon: CircleCheck, href: "/participants?status=REAL", tone: "text-emerald-600" },
    { label: "เก๊ · Blacklisted", value: stats.geh, icon: CircleX, href: "/participants?status=GEH", tone: "text-red-600" },
    { label: "Sessions conducted", value: stats.sessions, icon: MessagesSquare, href: "/participants?sort=recent" },
  ];

  const actions = [
    { href: "/prescreen", label: "Check Profile", icon: ScanSearch },
    { href: "/participants/new", label: "Add Participant", icon: UserPlus },
    { href: "/participants/new#import", label: "Import file", icon: FileUp },
  ];

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Participant Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">Find, vet and track research participants.</p>
        </div>
        <GlobalSearch />
        <div className="flex flex-wrap gap-2">
          {actions.map(({ href, label, icon: Icon }) => (
            <Button key={href} asChild variant="outline" size="sm">
              <Link href={href}><Icon /> {label}</Link>
            </Button>
          ))}
          <Button asChild variant="ghost" size="sm">
            <a href="/api/template" download><Download /> Excel template</a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, href, tone }) => (
          <Link key={label} href={href} className="group">
            <Card className="transition-colors group-hover:border-ring">
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
                </div>
                <Icon className={`size-5 ${tone ?? "text-muted-foreground"}`} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Recent sessions</CardTitle></CardHeader>
          <CardContent className="grid gap-1">
            {recentSessions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No sessions logged yet.</p>}
            {recentSessions.map((s) => (
              <Link key={s.id} href={`/participants/${s.participant.id}`} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{fullName(s.participant)}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.projectName} · {s.interviewer} · {formatDate(s.sessionDate)}</p>
                </div>
                <RatingBadge rating={s.behaviorRating} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recently flagged เก๊</CardTitle></CardHeader>
          <CardContent className="grid gap-1">
            {recentFlags.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No one flagged. 🎉</p>}
            {recentFlags.map((f) => (
              <Link key={f.id} href={`/participants/${f.participant.id}`} className="grid gap-0.5 rounded-md px-2 py-2 hover:bg-accent">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{fullName(f.participant)}</span>
                  <StatusBadge status="GEH" />
                </div>
                <p className="truncate text-xs text-muted-foreground">{REASON_LABEL[f.reason]} · {f.flaggedBy} · {formatDate(f.flaggedAt)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
