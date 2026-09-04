import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponseDrawer from "@/components/ResponseDrawer";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusChip from "@/components/StatusChip";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, CreditCard, Trash2 } from "lucide-react";

export default function Stripe() {
  const { jobId, operator } = useApp();
  const [job, setJob] = React.useState(jobId);
  React.useEffect(() => setJob(jobId), [jobId]);
  const [resp, setResp] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const state = async () => {
    if (!job) return toast.error("job_id required");
    setBusy("state");
    const r = await safeCall(() => api.post("/stripe/state", { job_id: job.trim() }));
    setBusy(""); setResp(r);
    if (!r.ok) toast.error(typeof r.error==="string"?r.error:"Check failed");
    else if (r.data?.status_code >= 400) toast.message("No active sandbox / not found");
  };
  const unlink = async () => {
    setOpen(false);
    if (!job) return toast.error("job_id required");
    setBusy("unlink");
    const r = await safeCall(() => api.post("/stripe/unlink", { job_id: job.trim(), operator }));
    setBusy(""); setResp(r);
    const sc = r.data?.status_code;
    if (r.ok && sc && sc < 400) toast.success("Sandbox unlinked (check verify below)");
    else toast.error(r.data?.error || (typeof r.error==="string"?r.error:("HTTP " + sc)));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Stripe Sandbox" subtitle="Check or unlink a job's Stripe sandbox. Uses the customer's own universal key (auto-resolved), so it is per-user scoped." badge={<StatusChip severity="red">unlink is destructive</StatusChip>} />
      <Card><CardContent className="p-4 space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">job_id</label>
          <Input value={job} onChange={(e)=>setJob(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&state()} className="mono mt-1.5 max-w-xl" data-testid="stripe-job-input" />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={state} disabled={busy==="state"||!job} data-testid="stripe-state-btn">
            {busy==="state"?<Loader2 className="h-4 w-4 animate-spin"/>:<CreditCard className="h-4 w-4"/>} Check sandbox
          </Button>
          <Button variant="destructive" onClick={()=>setOpen(true)} disabled={busy==="unlink"||!job} data-testid="stripe-unlink-btn">
            {busy==="unlink"?<Loader2 className="h-4 w-4 animate-spin"/>:<Trash2 className="h-4 w-4"/>} Unlink sandbox
          </Button>
        </div>
      </CardContent></Card>
      {resp && <ResponseDrawer title="integrations response" status={resp.data?.status_code} data={resp.data} error={typeof resp.error==="string"?resp.error:undefined} defaultOpen testId="stripe-response" />}
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Unlink Stripe sandbox"
        description={"This unlinks the Stripe sandbox for job " + job + ". The user can then re-connect Stripe fresh."}
        confirmValue={job} confirmLabel="Unlink sandbox" onConfirm={unlink} loading={busy==="unlink"} testId="stripe-confirm" />
    </div>
  );
}
