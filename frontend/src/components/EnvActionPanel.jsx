import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponseDrawer from "@/components/ResponseDrawer";
import ConfirmDialog from "@/components/ConfirmDialog";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function EnvActionPanel({
  title, subtitle, path, buildBody, okMsg, needsEnvKey,
  confirmText, buttonLabel, Icon,
}) {
  const { jobId, operator } = useApp();
  const [job, setJob] = React.useState(jobId);
  const [envKey, setEnvKey] = React.useState("");
  React.useEffect(() => setJob(jobId), [jobId]);

  const [resp, setResp] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const go = async () => {
    setOpen(false);
    if (!job && !(needsEnvKey && envKey)) return toast.error("job_id required");
    setBusy(true);
    const body = buildBody ? buildBody(job, envKey) : {};
    const r = await safeCall(() => api.post(path, { job_id: job, operator, ...body }));
    setBusy(false);
    setResp(r);
    const sc = r.data?.status_code;
    if (r.ok && sc && sc < 400) toast.success(okMsg);
    else toast.error(r.data?.error || r.data?.body?.detail || r.error || `HTTP ${sc}`);
  };

  const onClick = () => (confirmText ? setOpen(true) : go());
  const disabled = busy || (!job && !(needsEnvKey && envKey));

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">job_id</label>
            <Input data-testid="env-job-input" value={job}
              onChange={(e) => setJob(e.target.value)} className="mono mt-1.5 max-w-xl" />
          </div>
          {needsEnvKey && (
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">env_key / slug</label>
              <Input data-testid="env-key-input" value={envKey}
                onChange={(e) => setEnvKey(e.target.value)} className="mono mt-1.5 max-w-xl" placeholder="app slug" />
            </div>
          )}
          <Button onClick={onClick} disabled={disabled} data-testid="env-action-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
            {buttonLabel}
          </Button>
        </CardContent>
      </Card>
      {resp && (
        <ResponseDrawer title="agent-service response" status={resp.data?.status_code}
          data={resp.data} error={resp.error} defaultOpen testId="env-response" />
      )}
      {confirmText && (
        <ConfirmDialog open={open} onOpenChange={setOpen} title={title}
          description={confirmText.replace("{job}", job || "")} confirmValue={job}
          confirmLabel={buttonLabel} onConfirm={go} testId="env-action-confirm" />
      )}
    </div>
  );
}
