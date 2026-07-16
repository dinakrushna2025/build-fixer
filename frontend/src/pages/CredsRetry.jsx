import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import ResponseDrawer from "@/components/ResponseDrawer";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusChip from "@/components/StatusChip";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Trash2, RotateCw, Hammer } from "lucide-react";

export default function CredsRetry() {
  const { jobId, operator } = useApp();
  const [job, setJob] = React.useState(jobId);
  React.useEffect(() => setJob(jobId), [jobId]);

  const [batch, setBatch] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const [clearOpen, setClearOpen] = React.useState(false);
  const [clearLoading, setClearLoading] = React.useState(false);
  const [clearResp, setClearResp] = React.useState(null);

  const [tfLoading, setTfLoading] = React.useState(false);
  const [tfResp, setTfResp] = React.useState(null);
  const [tfOpen, setTfOpen] = React.useState(false);

  const [rebuildLoading, setRebuildLoading] = React.useState(false);
  const [rebuildResp, setRebuildResp] = React.useState(null);

  const doPreview = async () => {
    if (!job) return toast.error("job_id required");
    setPreviewLoading(true);
    const r = await safeCall(() => api.post("/creds/clear-asc/preview", { job_id: job }));
    setPreviewLoading(false);
    if (!r.ok) return toast.error(r.error);
    setPreview(r.data);
  };

  const doClear = async () => {
    setClearLoading(true);
    const r = await safeCall(() =>
      api.post("/creds/clear-asc", { job_id: job, operator, batch }),
    );
    setClearLoading(false);
    setClearOpen(false);
    setClearResp(r);
    if (r.ok) toast.success(`Cleared ${r.data?.count ?? "?"} job(s)`);
    else toast.error(r.error);
  };

  const doTestflight = async () => {
    setTfLoading(true);
    const r = await safeCall(() =>
      api.post("/creds/testflight-retry", { job_id: job, operator }),
    );
    setTfLoading(false);
    setTfOpen(false);
    setTfResp(r);
    if (r.ok && r.data?.status_code < 400) toast.success("TestFlight retry queued");
    else toast.error(r.error || `HTTP ${r.data?.status_code}`);
  };

  const doRebuild = async () => {
    setRebuildLoading(true);
    const r = await safeCall(() =>
      api.post("/creds/expo-rebuild", { job_id: job, operator }),
    );
    setRebuildLoading(false);
    setRebuildResp(r);
    if (!r.ok) toast.error(r.error);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credentials & Retry (iOS)"
        subtitle="Clear stuck Apple ASC credentials, retry TestFlight submissions, or kick off a fresh EAS rebuild."
        badge={<StatusChip severity="red">destructive</StatusChip>}
      />

      <Card>
        <CardContent className="p-4">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            job_id
          </label>
          <Input
            data-testid="creds-job-input"
            value={job}
            onChange={(e) => setJob(e.target.value)}
            className="mono mt-1.5 max-w-xl"
          />
        </CardContent>
      </Card>

      {/* clear-asc-credentials */}
      <Card data-testid="clear-asc-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-600" /> Clear ASC credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Wipes the Apple Store Connect key stored on the row. Any other job sharing the same{" "}
            <span className="mono">itc_team_id</span> + <span className="mono">api_key_id</span> is affected.
            Preview the batch before enabling it.
          </p>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={doPreview}
              disabled={previewLoading}
              data-testid="clear-asc-preview"
            >
              {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview affected jobs"}
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={batch}
                onCheckedChange={setBatch}
                data-testid="clear-asc-batch"
              />
              Batch-clear all affected jobs
            </label>
          </div>

          {preview && (
            <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs space-y-1">
              <div>
                <span className="mono">itc_team_id</span>: {preview.itc_team_id ?? "—"} ·{" "}
                <span className="mono">user_id</span>: {preview.user_id ?? "—"}
              </div>
              <div>Affected jobs ({preview.jobs?.length ?? 0}):</div>
              <div className="mono break-all">
                {(preview.jobs || []).join(", ") || "(none besides this one)"}
              </div>
            </div>
          )}

          <Button
            variant="destructive"
            onClick={() => setClearOpen(true)}
            disabled={!job}
            data-testid="clear-asc-submit"
          >
            <Trash2 className="h-4 w-4" /> Clear ASC credentials
          </Button>

          {clearResp && (
            <ResponseDrawer
              title="Clear response"
              status={clearResp.status}
              data={clearResp.data}
              error={clearResp.error}
              defaultOpen
              testId="clear-asc-response"
            />
          )}
        </CardContent>
      </Card>

      {/* testflight retry */}
      <Card data-testid="tf-retry-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <RotateCw className="h-4 w-4 text-primary" /> TestFlight retry
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            POST <span className="mono">/api/v1/ios/{"{JOB_ID}"}/testflight/retry</span> · no
            auth header.
          </p>
          <Button
            onClick={() => setTfOpen(true)}
            disabled={!job}
            data-testid="tf-retry-submit"
          >
            <RotateCw className="h-4 w-4" /> Retry TestFlight
          </Button>
          {tfResp && (
            <ResponseDrawer
              title="Retry response"
              status={tfResp.data?.status_code}
              data={tfResp.data}
              error={tfResp.error}
              defaultOpen
              testId="tf-retry-response"
            />
          )}
        </CardContent>
      </Card>

      {/* rebuild via expo MCP */}
      <Card data-testid="rebuild-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Hammer className="h-4 w-4 text-primary" /> Trigger EAS rebuild
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            Uses <span className="mono">mcp__expo build_run</span> — needs{" "}
            <span className="mono">EXPO_MCP_TOKEN</span>.
          </p>
          <Button
            onClick={doRebuild}
            variant="outline"
            disabled={rebuildLoading || !job}
            data-testid="rebuild-submit"
          >
            {rebuildLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Trigger rebuild"}
          </Button>
          {rebuildResp && (
            <ResponseDrawer
              title="mcp__expo response"
              status={rebuildResp.status}
              data={rebuildResp.data}
              error={rebuildResp.error}
              defaultOpen
              testId="rebuild-response"
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear ASC credentials"
        description={`This will wipe stored Apple ASC creds for job ${job}${
          batch ? " AND every other job on the same itc_team_id + api_key_id" : ""
        }. Fresh credentials must be uploaded before the next TestFlight push works.`}
        confirmValue={job}
        confirmLabel={batch ? "Clear ASC (batch)" : "Clear ASC"}
        onConfirm={doClear}
        loading={clearLoading}
        testId="clear-asc-confirm"
      />
      <ConfirmDialog
        open={tfOpen}
        onOpenChange={setTfOpen}
        title="Retry TestFlight submission"
        description={`This will trigger a fresh TestFlight submission for job ${job}. If the underlying issue isn't fixed, it will fail again.`}
        confirmValue={job}
        confirmLabel="Retry TestFlight"
        onConfirm={doTestflight}
        loading={tfLoading}
        testId="tf-retry-confirm"
      />
    </div>
  );
}
