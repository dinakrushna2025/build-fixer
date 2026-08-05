import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponseDrawer from "@/components/ResponseDrawer";
import StatusChip from "@/components/StatusChip";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";

export default function SuprSend() {
  const { jobId } = useApp();
  const [job, setJob] = React.useState(jobId);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [raw, setRaw] = React.useState(null);

  React.useEffect(() => setJob(jobId), [jobId]);

  const check = async () => {
    if (!job) return toast.error("Enter a job_id");
    setLoading(true);
    const r = await safeCall(() => api.post("/suprsend", { job_id: job }));
    setLoading(false);
    setRaw(r);
    if (!r.ok) return toast.error(r.error || "Lookup failed");
    setData(r.data);
  };

  const connected = (data && data.suprsend_connected) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="SuprSend Connection"
        subtitle="Which of this job owner's app slugs is connected to SuprSend (push relay)? Resolves every owner slug, then checks push_apps / push_apps_suprsend."
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              job_id
            </label>
            <Input
              data-testid="suprsend-job-input"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && check()}
              className="mono mt-1.5"
            />
          </div>
          <Button onClick={check} disabled={loading} data-testid="suprsend-check-btn">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}
            Check SuprSend
          </Button>
        </CardContent>
      </Card>

      {data && (
        <Card data-testid="suprsend-result">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Result</CardTitle>
              {!data.found ? (
                <StatusChip severity="red">Not found</StatusChip>
              ) : connected.length > 0 ? (
                <StatusChip severity="green">{connected.length} connected</StatusChip>
              ) : (
                <StatusChip severity="amber">Not connected</StatusChip>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!data.found ? (
              <div className="text-sm text-muted-foreground py-4">
                {data.reason || data.error || "No data"}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {data.note}{" "}
                  <span className="mono">({data.slug_count} slugs checked)</span>
                </div>
                {connected.length > 0 && (
                  <div className="space-y-2">
                    {connected.map((c) => (
                      <div
                        key={c.app_id}
                        className="rounded-md border border-border px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium">{c.app_id}</span>
                          <StatusChip severity="green">{c.provider}</StatusChip>
                        </div>
                        <div className="mono text-[11px] text-muted-foreground mt-1">
                          workspace: {c.workspace_slug} | provisioned: {c.provisioned_at}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {raw && (
        <ResponseDrawer
          title="Raw /suprsend response"
          status={raw.status}
          data={raw.data}
          error={raw.error}
          testId="suprsend-raw"
        />
      )}
    </div>
  );
}
