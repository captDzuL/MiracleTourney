import { AlertTriangle, CheckCircle2, Clock3, Radio, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatusBadgeStatus = "live" | "upcoming" | "completed" | "cancelled" | "draft";

const statuses = {
  live: { Icon: Radio, label: "Live now", className: "bg-[var(--color-surface-selected)] text-[var(--color-brand-cyan)]" },
  upcoming: {
    Icon: Clock3,
    label: "Upcoming",
    className: "bg-[var(--color-surface-subtle)] text-[var(--color-feedback-warning,var(--color-text))]",
  },
  completed: {
    Icon: CheckCircle2,
    label: "Completed",
    className: "bg-[var(--color-surface-subtle)] text-[var(--color-feedback-success,var(--color-text))]",
  },
  cancelled: {
    Icon: XCircle,
    label: "Cancelled",
    className: "bg-[var(--color-surface-subtle)] text-[var(--color-feedback-error,var(--color-text))]",
  },
  draft: {
    Icon: AlertTriangle,
    label: "Draft",
    className: "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]",
  },
} satisfies Record<StatusBadgeStatus, { Icon: typeof Radio; label: string; className: string }>;

export type StatusBadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  status: StatusBadgeStatus;
};

export function StatusBadge({ className, status, ...props }: StatusBadgeProps) {
  const { Icon, label, className: statusClassName } = statuses[status];

  return (
    <span
      {...props}
      data-status-badge={status}
      className={cn(
        "miracle-v3-feedback inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
        statusClassName,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </span>
  );
}
