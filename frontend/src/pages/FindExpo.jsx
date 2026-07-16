import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InfoRow from "@/components/InfoRow";
import ResponseDrawer from "@/components/ResponseDrawer";
import StatusChip from "@/components/StatusChip";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";

export default function FindExpo() {
  const { jobId } = useApp();
  const [mode, setMode] = React.useState("job");
  const [job, setJob] = React.useState(jobId);
  const [appId, setAppId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [raw, setRaw] = React.useState(null);

  const [buildsLoading, setBuildsLoading] = React.useState(false);
  const [builds, setBuilds] = React.useState(null);

  React.useEffect(() => setJob(jobId), [jobId]);

  const lookup = async () => {
    const body = mode === "job" ? { job_id: job } : { app_id: appId };
    if ((mode === "job" && !job) || (mode === "app" && !appId)) {
      return toast.error(`Enter an ${mode === "job" ? "job_id" : "app_id"}`);
    }
    setLoading(true);
    const r = await safeCall(() => api.post("/expo/lookup", body));
    setLoading(false);
    setRaw(r);
    if (!r.ok) return toast.error(r.error || "Lookup failed");
    setData(r.data);
  };

  const crossCheck = async () => {
    setBuildsLoading(true);
    const r = await safeCall(() =>
      api.post("/expo/builds", { app_id: data?.app_id }),
    );
    setBuildsLoading(false);
    setBuilds(r);
    if (!r.ok) toast.error(r.error || "MCP call failed");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find Expo Account"
        subtitle="Resolve which internal Expo account owns an app. If passed a job_id, we auto-resolve the app_id from ios/android_app_configs first."
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList>
              <TabsTrigger value="job" data-testid="tab-by-job">By job_id</TabsTrigger>
              <TabsTrigger value="app" data-testid="tab-by-app">By app_id</TabsTrigger>
            </TabsList>
            <TabsContent value="job" className="mt-3">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                job_id
              </label>
              <Input
                data-testid="expo-job-input"
                value={job}
                onChange={(e) => setJob(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookup()}
                className="mono mt-1.5"
              />
            </TabsContent>
            <TabsContent value="app" className="mt-3">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                app_id
              </label>
              <Input
                data-testid="expo-app-input"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookup()}
                className="mono mt-1.5"
              />
            </TabsContent>
          </Tabs>
          <div>
            <Button onClick={lookup} disabled={loading} data-testid="expo-lookup-btn">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Look up
            </Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <Card data-testid="expo-result">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Result</CardTitle>
              <div className="flex items-center gap-2">
                {data.empty_expo && (
                  <StatusChip severity="amber">No Expo account linked</StatusChip>
                )}
                {data.found && !data.empty_expo && (
                  <StatusChip severity="green">Expo account resolved</StatusChip>
                )}
                {!data.found && (
                  <StatusChip severity="red">Not found</StatusChip>
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
              <div className="divide-y divide-border">
                <InfoRow label="app_id" value={data.app_id} mono testId="expo-row-app-id" />
                {data.resolved_from && (
                  <InfoRow label="resolved from" value={data.resolved_from} mono />
                )}
                <InfoRow label="app" value={data.row?.app} />
                <InfoRow label="expo_id" value={data.row?.expo_id} mono />
                <InfoRow label="expo_owner" value={data.row?.expo_owner} mono />
              </div>
            )}
            {data.found && (
              <div className="mt-4 flex items-center gap-3 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={crossCheck}
                  disabled={buildsLoading}
                  data-testid="expo-crosscheck"
                >
                  {buildsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cross-check via mcp__expo"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  requires <span className="mono">EXPO_MCP_TOKEN</span> on the backend
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {builds && (
        <ResponseDrawer
          title="mcp__expo build_list response"
          status={builds.status}
          data={builds.data}
          error={builds.error}
          defaultOpen
          testId="expo-builds-response"
        />
      )}
      {raw && (
        <ResponseDrawer
          title="Raw /expo/lookup response"
          status={raw.status}
          data={raw.data}
          error={raw.error}
          testId="expo-raw"
        />
      )}
    </div>
  );
}
