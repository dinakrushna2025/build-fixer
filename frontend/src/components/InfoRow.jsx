import React from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Copy, Check } from "lucide-react";

/**
 * A key/value row for a config table. Handles:
 *   - null/undefined values -> muted "—"
 *   - masked sensitive fields (backend sends {present, masked})
 *   - copy-to-clipboard for identifiers
 */
export default function InfoRow({ label, value, mono = false, testId }) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const isMasked = value && typeof value === "object" && "masked" in value;

  const display = React.useMemo(() => {
    if (value === null || value === undefined || value === "") return "—";
    if (isMasked) {
      if (!value.present) return "— (not set)";
      return revealed ? "(reveal disabled by policy)" : value.masked;
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }, [value, revealed, isMasked]);

  const copy = async () => {
    if (isMasked || display === "—") return;
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  return (
    <div
      data-testid={testId}
      className="grid grid-cols-[180px_1fr] gap-4 py-2 border-b border-border last:border-b-0 items-start"
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground pt-0.5">
        {label}
      </div>
      <div className={cn("flex items-center gap-2 text-sm", mono && "mono")}>
        <span
          className={cn(
            "flex-1 break-all",
            display === "—" && "text-muted-foreground",
            isMasked && "mono",
          )}
        >
          {display}
        </span>
        {isMasked && value?.present && (
          <button
            className="text-muted-foreground/70 hover:text-foreground disabled:opacity-40"
            onClick={() => setRevealed((v) => !v)}
            disabled
            title="Reveal disabled — never render raw credentials in the UI"
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
        {!isMasked && display !== "—" && (
          <button
            className="text-muted-foreground/70 hover:text-foreground"
            onClick={copy}
            title="Copy"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
