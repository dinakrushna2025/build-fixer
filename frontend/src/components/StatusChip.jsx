import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, Circle } from "lucide-react";

const STYLES = {
  green: {
    ring: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
    Icon: CheckCircle2,
  },
  amber: {
    ring: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    Icon: AlertTriangle,
  },
  red: {
    ring: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20",
    Icon: XCircle,
  },
  neutral: {
    ring: "bg-secondary text-foreground/70 border-border",
    Icon: Circle,
  },
};

export default function StatusChip({ severity = "neutral", children, testId }) {
  const s = STYLES[severity] || STYLES.neutral;
  const Icon = s.Icon;
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        s.ring,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {children}
    </span>
  );
}
