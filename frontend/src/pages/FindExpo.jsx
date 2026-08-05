import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InfoRow from "@/components/InfoRow";
import ResponseDrawer from "@/components/ResponseDrawer";
import StatusChip from "@/components/StatusChip";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Search, Loader2, UserSearch, BellRing } from "lucide-react";

const MODES = [
  { key: "expo", label: "Expo Account", icon: UserSearch },
  { key: "suprsend", label: "SuprSend", icon: BellRing },
];

export default function FindExpo() {
  const { jobId } = useApp();
  const [job, setJob] = React.useState(jobId);
  const [mode, setMode] = React.useState("expo");
  const [loading, setLoading] = React.useState(false);
  const [raw, setRaw] = React.useState(null);

  // expo state
  const [data, setData] = React.useState(null);
  const [buildsLoading, setBuildsLoading] = React.useState(false);
  const [builds, setBuilds] = React.useState(null);

  // suprsend state
  const [sdata, setSdata] = React.useState(null);

  React.useEffect(() => setJob(jobId), [jobId]);

  const run = async () => {
    if (!job) return toast.error("Enter a job_id");
    setLoading(true);
    if (mode === "expo") {
      const r = await safeCall(() => api.post("/expo/lookup", { job_id: job }));
      setLoading(false);
      setRaw(r);
      if (!r.ok) return toast.error(r.error || "Lookup failed");
      setData(r.data);
    } else {
      const r = await safeCall(() => api.post("/suprsend", { job_id: job }));
      setLoading(false);
      setRaw(r);
      if (!r.ok) return toast.error(r.error || "Lookup failed");
      setSdata(r.data);
    }
  };

  const crossCheck = async () => {
    setBuildsLoading(true);
    const r = await safeCall(() =>
      api.post("/expo/builds", { job_id: job, expo_id: data?.row?.expo_id }),
    );
    setBuildsLoading(false);
    setBuilds(r);
    if (!r.ok) toast.error(r.error || "Cross-check failed");
  };

  const connected = (sdata && sdata.suprsend_connected) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find Account"
        subtitle="Enter a job_id, then choose what to resolve: the Expo account that owns the build, or the app slug connected to SuprSend (push relay)."
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              job_id
            </label>
            <Input
              data-testid="expo-job-input"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="mono mt-1.5"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              What do you want to find?
            </label>
            <div className="mt-1.5 inline-flex rounded-md border border-border p-1 gap-1 ml-2">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = mode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m.key)}
                    data-testid={`expo-mode-${m.key}`}
                    className={
                      "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors " +
                      (active
                        ? "bg-indigo-600 text-white"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Button onClick={run} disabled={loading} data-testid="expo-lookup-btn">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {mode === "expo" ? "Find Expo account" : "Check SuprSend"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {mode === "expo" && data && (
        <Card data-testid="expo-result">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Result</CardTitle>
              <div className="flex items-center gap-2">
                {!data.found && <StatusChip severity="red">Not found</StatusChip>}
                {data.found && data.row?.expo_owner && (
                  <StatusChip severity="green">Expo account resolved</StatusChip>
                )}
                {data.found && !data.row?.expo_owner && data.candidates?.length > 0 && (
                  <StatusChip severity="amber">Multiple candidates - pick one</StatusChip>
                )}
                {data.found && !data.row?.expo_owner && !(data.candidates?.length > 0) && (
                  <StatusChip severity="amber">No Expo account linked</StatusChip>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!data.found ? (
              <div className="text-sm text-muted-foreground py-4">
                {data.reason || "No matching row"}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="divide-y divide-border">
                  <InfoRow label="app_id" value={data.app_id} mono testId="expo-row-app-id" />
                  {data.resolved_from && (
                    <InfoRow label="resolved from" value={data.resolved_from} mono />
                  )}
                  {data.direct_app && (
                    <InfoRow label="this app (no expo of its own)" value={data.direct_app} />
                  )}
                  <InfoRow label="app" value={data.row?.app} />
                  <InfoRow label="expo_id" value={data.row?.expo_id} mono />
                  <InfoRow label="expo_owner" value={data.row?.expo_owner} mono />
                </div>
                {data.candidates?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Owner's Expo-linked apps ({data.candidates.length}) - pick the right one
                    </div>
                    <div className="space-y-1.5">
                      {data.candidates.map((c) => (
                        <div
                          key={c.app_id}
                          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <span className="truncate">{c.app}</span>
                          <span className="mono text-xs text-muted-foreground shrink-0">
                            {c.expo_owner} | {c.expo_id}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.note && (
                  <div className="text-xs text-muted-foreground">{data.note}</div>
                )}
              </div>
            )}
            {data.found && data.row?.expo_id && (
              <div className="mt-4 flex items-center gap-3 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={crossCheck}
                  disabled={buildsLoading}
                  data-testid="expo-crosscheck"
                >
                  {buildsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Cross-check on live Expo"
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  verifies the build's EAS project against the resolved account (live)
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "suprsend" && sdata && (
        <Card data-testid="suprsend-result">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">SuprSend</CardTitle>
              {!sdata.found ? (
                <StatusChip severity="red">Not found</StatusChip>
              ) : connected.length > 0 ? (
                <StatusChip severity="green">{connected.length} connected</StatusChip>
              ) : (
                <StatusChip severity="amber">Not connected</StatusChip>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!sdata.found ? (
              <div className="text-sm text-muted-foreground py-4">
                {sdata.reason || sdata.error || "No data"}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {sdata.note}{" "}
                  <span className="mono">({sdata.slug_count} slugs checked)</span>
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

      {mode === "expo" && builds && (
        <ResponseDrawer
          title="Live Expo cross-check response"
          status={builds.status}
          data={builds.data}
          error={builds.error}
          defaultOpen
          testId="expo-builds-response"
        />
      )}
      {raw && (
        <ResponseDrawer
          title={mode === "expo" ? "Raw /expo/lookup response" : "Raw /suprsend response"}
          status={raw.status}
          data={raw.data}
          error={raw.error}
          testId="expo-raw"
        />
      )}
    </div>
  );
}
