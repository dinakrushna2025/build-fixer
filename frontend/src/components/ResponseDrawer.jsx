import React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ResponseDrawer({ status, data, error, title = "Response", defaultOpen = false, testId }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const okColor =
    status && status >= 200 && status < 300
      ? "text-emerald-600 dark:text-emerald-400"
      : status
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        asChild
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        <button className="w-full flex items-center justify-between gap-3 text-left rounded-md border border-border bg-secondary/50 hover:bg-secondary px-3 py-2 text-sm">
          <span className="flex items-center gap-2">
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium">{title}</span>
            {status !== undefined && (
              <span className={cn("mono text-xs", okColor)}>HTTP {status || "—"}</span>
            )}
            {error && (
              <span className="text-xs text-red-600 dark:text-red-400 truncate max-w-md">
                {error}
              </span>
            )}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre
          data-testid={testId}
          className="mono text-xs bg-card border border-t-0 border-border rounded-b-md p-3 overflow-auto thin-scroll max-h-[420px] whitespace-pre-wrap break-all"
        >
          {typeof data === "string"
            ? data
            : JSON.stringify(data ?? {}, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
