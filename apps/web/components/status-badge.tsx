import { CheckCircle2, CircleDashed, Clock, Hand, Loader, OctagonX, PauseCircle } from "lucide-react";
import type { RunStatus } from "@app/shared";
import { cn } from "./ui";

const LOOK: Record<RunStatus, { icon: typeof Clock; tone: string }> = {
  QUEUED: { icon: Clock, tone: "text-muted" },
  EXTRACTING: { icon: Loader, tone: "text-primary" },
  NEEDS_PROFILE_CONFIRM: { icon: Hand, tone: "text-ink" },
  PLANNING: { icon: Loader, tone: "text-primary" },
  EXECUTING: { icon: Loader, tone: "text-primary" },
  AWAITING_HUMAN: { icon: Hand, tone: "text-ink" },
  AWAITING_FINAL_APPROVAL: { icon: Hand, tone: "text-ink" },
  SUBMITTING: { icon: Loader, tone: "text-primary" },
  COMPLETED: { icon: CheckCircle2, tone: "text-success" },
  FAILED: { icon: OctagonX, tone: "text-danger" },
  CANCELLED: { icon: CircleDashed, tone: "text-muted" },
  PAUSED_EXPIRED: { icon: PauseCircle, tone: "text-ink" },
};

/** Status with an icon and words, never colour alone. */
export function StatusBadge({ status, label }: { status: RunStatus; label: string }) {
  const { icon: Icon, tone } = LOOK[status];
  const needsYou = status === "AWAITING_HUMAN" || status === "AWAITING_FINAL_APPROVAL" || status === "NEEDS_PROFILE_CONFIRM";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold",
        needsYou ? "border-accent bg-accent/15" : "border-line bg-paper",
      )}
    >
      <Icon aria-hidden className={cn("size-4", tone)} />
      {label}
    </span>
  );
}
