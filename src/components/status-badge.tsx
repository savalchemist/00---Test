import type { ParticipantStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/lib/constants";

export function StatusBadge({ status }: { status: ParticipantStatus }) {
  return (
    <Badge variant={status === "REAL" ? "success" : "danger"}>
      <span className={status === "REAL" ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-red-500"} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function RatingBadge({ rating }: { rating: number }) {
  const variant = rating === 3 ? "success" : rating === 2 ? "warning" : "danger";
  const label = rating === 3 ? "เล่าดี" : rating === 2 ? "พอให้ข้อมูลได้" : "ตอบงง";
  return (
    <Badge variant={variant}>
      {rating} · {label}
    </Badge>
  );
}
