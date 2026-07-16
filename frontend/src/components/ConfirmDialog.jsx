import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertOctagon } from "lucide-react";

/**
 * Typed-confirmation modal. Operator must retype the job_id (or any
 * `confirmValue`) exactly to enable the destructive action button.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmValue,
  confirmLabel = "Confirm",
  onConfirm,
  loading = false,
  testId = "confirm",
}) {
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const matches = typed.trim() === (confirmValue || "").trim() && !!confirmValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={`${testId}-dialog`}
        className="border-border"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 grid place-items-center shrink-0">
              <AlertOctagon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1.5">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          <label className="text-xs text-muted-foreground">
            Type <span className="mono text-foreground">{confirmValue}</span> to confirm
          </label>
          <Input
            data-testid={`${testId}-input`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mono"
            placeholder={confirmValue}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid={`${testId}-cancel`}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || loading}
            onClick={onConfirm}
            data-testid={`${testId}-submit`}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
