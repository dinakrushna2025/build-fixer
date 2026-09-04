import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusChip from "@/components/StatusChip";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Search, Database, Upload } from "lucide-react";

export default function DbCopy() {
  const { jobId, operator } = useApp();
  const [job, setJob] = React.useState(jobId);
  React.useEffect(() => setJob(jobId), [jobId]);
  const [coll, setColl] = React.useState("");
  const [mode, setMode] = React.useState("upsert");
  const [busy, setBusy] = React.useState("");
  const [res, setRes] = React.useState(null);
  const [open, setOpen] = React.useState(false);

  const body = () => ({ job_id: (job || "").trim(), collection: coll.trim() || null, mode, operator });

  const inspect = async () => {
    if (!job) return toast.error("job_id required");
    setBusy("inspect"); setRes(null);
    const r = await safeCall(() => api.post("/dbcopy/inspect", body()));
    setBusy("");
    setRes(r.data || { ok: false, error: typeof r.error === "string" ? r.error : "failed" });
    if (r.data?.ok) toast.success("Inspected preview to prod");
    else toast.error(r.data?.error || "Inspect failed");
  };

  const run = async () => {
    setOpen(false);
    if (!job) return toast.error("job_id required");
    setBusy("run"); setRes(null);
    const r = await safeCall(() => api.post("/dbcopy/run", body()));
    setBusy("");
    setRes(r.data || { ok: false, error: typeof r.error === "string" ? r.error : "failed" });
    if (r.data?.ok) toast.success("Copy complete");
    else toast.error(r.data?.error || "Copy failed");
  };

  const rows = res && res.collections ? Object.entries(res.collections) : [];
  const scope = coll.trim() ? ("collection " + coll.trim()) : "ALL collections";

  return (
    <div className="space-y-6">
      <PageHeader
        title="DB Copy (Preview to Prod)"
        subtitle="Bulk copy a job's preview database into its production database. Runs inside the customer preview pod. Prod MONGO_URL and DB_NAME are auto-resolved from the job."
        badge={<StatusChip severity="red">writes to production</StatusChip>}
      />

      <Card><CardContent className="p-4 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">job_id</label>
          <Input value={job} onChange={(e) => setJob(e.target.value)} onKeyDown={(e) => e.key === "Enter" && inspect()} className="mono mt-1.5 max-w-xl" data-testid="dbcopy-job-input" />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">collection (optional)</label>
          <Input value={coll} onChange={(e) => setColl(e.target.value)} placeholder="leave empty to copy ALL collections" className="mono mt-1.5 max-w-xl" data-testid="dbcopy-coll-input" />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">write mode</label>
          <div className="flex items-center gap-2 mt-1.5">
            <Button type="button" variant={mode === "upsert" ? "default" : "outline"} size="sm" onClick={() => setMode("upsert")} data-testid="dbcopy-mode-upsert">Upsert (merge by _id)</Button>
            <Button type="button" variant={mode === "replace" ? "destructive" : "outline"} size="sm" onClick={() => setMode("replace")} data-testid="dbcopy-mode-replace">Replace (drop first)</Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {mode === "upsert"
              ? "Upsert keeps existing prod docs and overwrites matching _id. Safe and repeatable."
              : "Replace DROPS each prod collection before copying. Existing prod data in those collections is lost."}
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={inspect} disabled={busy !== "" || !job} variant="outline" data-testid="dbcopy-inspect-btn">
            {busy === "inspect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Inspect (dry run)
          </Button>
          <Button onClick={() => setOpen(true)} disabled={busy !== "" || !job} variant="destructive" data-testid="dbcopy-run-btn">
            {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Copy to production
          </Button>
        </div>
      </CardContent></Card>

      {res && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{res.ok ? "Result" : "Error"}</span>
            {res.dry && <StatusChip severity="amber">dry run</StatusChip>}
            {res.ok && !res.dry && <StatusChip severity="green">copied</StatusChip>}
            {!res.ok && <StatusChip severity="red">failed</StatusChip>}
          </div>

          {(res.resolved_via || res.app_status || res.prod_host) && (
            <div className="text-[11px] mono text-muted-foreground space-y-0.5">
              {res.resolved_via && <div>resolved via: <span className="text-foreground">{res.resolved_via}</span></div>}
              {res.app_status && <div>app status: <span className={res.app_status === "deleted" ? "text-red-500" : "text-foreground"}>{res.app_status}</span></div>}
              {res.prod_host && <div>prod host: <span className="text-foreground">{res.prod_host}</span></div>}
            </div>
          )}

          {res.app_status === "deleted" && (
            <div className="text-[11px] text-amber-600 border border-amber-500/40 rounded-md p-2">
              Heads up: the resolved app is deleted, so its saved MONGO_URL may point to a paused or torn down prod cluster. The copy target could be stale. Verify the live prod DB before copying.
            </div>
          )}

          {!res.ok && <p className="text-sm text-red-500 mono">{res.error}</p>}

          {res.ok && (
            <div className="text-xs mono text-muted-foreground space-y-0.5">
              <div>slug: <span className="text-foreground">{res.slug}</span></div>
              <div>preview db: <span className="text-foreground">{res.preview_db}</span></div>
              <div>prod db: <span className="text-foreground">{res.prod_db}</span></div>
              <div>mode: <span className="text-foreground">{res.mode}</span></div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs mono">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-4">collection</th>
                    <th className="py-1.5 pr-4">preview</th>
                    <th className="py-1.5 pr-4">{res.dry ? "prod (before)" : "copied"}</th>
                    <th className="py-1.5 pr-4">{res.dry ? "" : "prod (after)"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([name, c]) => (
                    <tr key={name} className="border-b border-border/50">
                      <td className="py-1.5 pr-4 text-foreground">{name}</td>
                      <td className="py-1.5 pr-4">{res.dry ? c.src_count : c.copied}</td>
                      <td className="py-1.5 pr-4">{res.dry ? c.prod_count : c.copied}</td>
                      <td className="py-1.5 pr-4">{res.dry ? "" : c.prod_count_after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent></Card>
      )}

      <ConfirmDialog
        open={open} onOpenChange={setOpen}
        title="Copy preview database to production"
        description={"This copies " + scope + " from the preview DB into the PRODUCTION DB for job " + (job || "") + " using mode '" + mode + "'." + (mode === "replace" ? " Replace mode DROPS the prod collections first." : "")}
        confirmValue={job} confirmLabel="Copy to production" onConfirm={run} loading={busy === "run"} testId="dbcopy-confirm"
      />
    </div>
  );
}
