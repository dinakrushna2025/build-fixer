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
import { GitFork, Loader2, CornerDownRight } from "lucide-react";

function statusSeverity(s) {
  if (s === "COMPLETED") return "green";
  if (s === "ARCHIVED" || s === "FAILED") return "red";
  return "amber";
}

function Node({ node, tag, highlight }) {
  return (
    <div
      className={
        "rounded-md border px-3 py-2 " +
        (highlight ? "border-primary bg-primary/5" : "border-border")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {node.title || "(untitled)"}
          </div>
          <div className="mono text-[11px] text-muted-foreground truncate">
            {node.id}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tag && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {tag}
            </span>
          )}
          <StatusChip severity={statusSeverity(node.status)}>
            {node.status || "?"}
          </StatusChip>
        </div>
      </div>
    </div>
  );
}

export default function ForkChain() {
  const { jobId } = useApp();
  const [job, setJob] = React.useState(jobId);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [raw, setRaw] = React.useState(null);

  React.useEffect(() => setJob(jobId), [jobId]);

  const trace = async () => {
    if (!job) return toast.error("Enter a job_id");
    setLoading(true);
    const r = await safeCall(() => api.post("/forkchain", { job_id: job }));
    setLoading(false);
    setRaw(r);
    if (!r.ok) return toast.error(r.error || "Lookup failed");
    setData(r.data);
  };

  const lineage =
    data && data.found ? [...(data.ancestors || [])].reverse() : [];
  const forked = data && data.found && (data.ancestors || []).length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fork Chain"
        subtitle="Trace where a session's job came from: its fork/clone ancestors up to the original app, and any jobs forked from it. Reads the jobs table lineage (DS10)."
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              job_id
            </label>
            <Input
              data-testid="fork-job-input"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && trace()}
              className="mono mt-1.5"
            />
          </div>
          <Button onClick={trace} disabled={loading} data-testid="fork-trace-btn">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitFork className="h-4 w-4" />
            )}
            Trace chain
          </Button>
        </CardContent>
      </Card>

      {data && (
        <Card data-testid="fork-result">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Lineage</CardTitle>
              {data.found ? (
                <StatusChip severity={forked ? "green" : "amber"}>
                  {forked ? "Forked" : "Root job"}
                </StatusChip>
              ) : (
                <StatusChip severity="red">Not found</StatusChip>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!data.found ? (
              <div className="text-sm text-muted-foreground py-4">
                {data.reason || "No lineage"}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">{data.summary}</div>

                <div className="space-y-2">
                  {lineage.map((n, i) => (
                    <div key={n.id} className="space-y-2">
                      <Node node={n} tag={i === 0 ? "original" : "ancestor"} />
                      <div className="pl-3 text-muted-foreground">
                        <CornerDownRight className="h-4 w-4" />
                      </div>
                    </div>
                  ))}
                  <Node node={data.job} tag="this job" highlight />
                </div>

                {data.children && data.children.length > 0 && (
                  <div className="pt-2">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Forked from this job ({data.children.length})
                    </div>
                    <div className="space-y-2">
                      {data.children.map((c) => (
                        <Node key={c.id} node={c} tag="child" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {raw && (
        <ResponseDrawer
          title="Raw /forkchain response"
          status={raw.status}
          data={raw.data}
          error={raw.error}
          testId="fork-raw"
        />
      )}
    </div>
  );
}
