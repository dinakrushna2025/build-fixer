import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusChip from "@/components/StatusChip";
import InfoRow from "@/components/InfoRow";
import ResponseDrawer from "@/components/ResponseDrawer";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Stethoscope, FileWarning, Layers } from "lucide-react";

export default function Diagnose() {
  const { jobId } = useApp();
  const [job, setJob] = React.useState(jobId);
  React.useEffect(() => setJob(jobId), [jobId]);

  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [raw, setRaw] = React.useState(null);
  const [logs, setLogs] = React.useState(null);
  const [logsLoading, setLogsLoading] = React.useState(false);

  const run = async () => {
    if (!job) return toast.error("Enter a job_id");
    setLoading(true);
    const r = await safeCall(() => api.post("/diagnose", { job_id: job }));
    setLoading(false);
    setRaw(r);
    if (!r.ok) return toast.error(r.error || "Diagnose failed");
    setData(r.data);
    if (!r.data.banner.found) toast.warning("No config rows found for that job_id");
  };

  const pullLogs = async () => {
    setLogsLoading(true);
    const r = await safeCall(() => api.post("/diagnose/logs", { job_id: job }));
    setLogsLoading(false);
    setLogs(r);
    if (!r.ok) toast.error(r.error || "Log fetch failed");
  };

  const iosRow = data?.ios?.row;
  const andRow = data?.android?.row;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnose"
        subtitle="Look up the ground-truth iOS + Android config rows for a job. Two Redash queries against DS5, with red-flag detection and a hook to pull the real Cloud Build / EAS failure logs."
      />

      <Card>
        <CardContent className="p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              job_id
            </label>
            <Input
              data-testid="diagnose-job-input"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="e.g. 6c5f4e3b-…"
              className="mono mt-1.5"
            />
          </div>
          <Button
            data-testid="diagnose-run"
            onClick={run}
            disabled={loading}
            className="min-w-[120px]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
            Run
          </Button>
        </CardContent>
      </Card>

      {data?.banner?.found && (
        <Card data-testid="diagnose-banner">
          <CardContent className="p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold tracking-tight mr-2">Platform</div>
              <StatusChip severity="neutral" testId="banner-platform">
                {data.banner.platform}
              </StatusChip>
              {data.banner.is_eas && (
                <StatusChip severity="neutral" testId="banner-eas">
                  <Layers className="h-3.5 w-3.5" /> EAS build
                </StatusChip>
              )}
              {data.resolved_user_id && (
                <span className="text-xs text-muted-foreground mono ml-2">
                  owner user_id: <span className="text-foreground">{data.resolved_user_id}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {data.banner.flags.map((f, i) => (
                <StatusChip key={i} severity={f.severity} testId={`banner-flag-${i}`}>
                  {f.label}
                </StatusChip>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConfigCard
          title="iOS · ios_app_configs"
          testId="ios-card"
          row={iosRow}
          fields={IOS_FIELDS}
          empty="No iOS row for this job_id"
        />
        <ConfigCard
          title="Android · android_app_configs"
          testId="android-card"
          row={andRow}
          fields={ANDROID_FIELDS}
          empty="No Android row for this job_id"
        />
      </div>

      {data?.banner?.found && (
        <Card data-testid="diagnose-logs-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-amber-600" />
                Build failure logs (Cloud Build / EAS pipeline)
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={pullLogs}
                disabled={logsLoading}
                data-testid="pull-logs-btn"
              >
                {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pull logs"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {!logs && (
              <p className="text-sm text-muted-foreground">
                The actionable build error lives in Cloud Build / pipeline logs, not the DB row. Click{" "}
                <span className="mono">Pull logs</span> to fetch via <span className="mono">mcp__deployer</span>.
              </p>
            )}
            {logs && (
              <div className="space-y-2">
                {logs.ok === false && <p className="text-sm text-red-500">{typeof logs.error === "string" ? logs.error : "Log fetch failed"}</p>}
                {logs.data?.found === false && <p className="text-sm text-muted-foreground">No build or logs found for this job.</p>}
                {logs.data && (
                  <>
                    <div className="text-xs mono text-muted-foreground">
                      {logs.data.app ? ("app: " + logs.data.app) : ""}{logs.data.status_note ? (" · " + logs.data.status_note) : ""}
                    </div>
                    <pre className="text-[11px] mono whitespace-pre-wrap break-all bg-secondary rounded-md p-3 overflow-x-auto max-h-[60vh]">{JSON.stringify(logs.data, null, 2)}</pre>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}

const IOS_FIELDS = [
  ["bundle_id", "bundle_id", true],
  ["team_id", "team_id", true],
  ["apple_id", "apple_id", true],
  ["itc_team_id", "itc_team_id", true],
  ["api_key_id", "api_key_id", true],
  ["testflight_status", "testflight_status"],
  ["testflight_error", "testflight_error"],
  ["certificate_expires_at", "certificate_expires_at"],
  ["profile_expires_at", "profile_expires_at"],
  ["fastlane_session", "fastlane_session"],
];

const ANDROID_FIELDS = [
  ["package_name", "package_name", true],
  ["key_alias", "key_alias", true],
  ["keystore_path", "keystore_path", true],
  ["expo_project_id", "expo_project_id", true],
  ["apk_url", "apk_url", true],
  ["aab_url", "aab_url", true],
  ["keystore_password", "keystore_password"],
  ["created_at", "created_at"],
];

function ConfigCard({ title, row, fields, empty, testId }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {!row ? (
          <div className="text-sm text-muted-foreground py-6 text-center">{empty}</div>
        ) : (
          <div className="divide-y divide-border">
            {fields.map(([key, label, mono]) => (
              <InfoRow
                key={key}
                label={label}
                value={row[key]}
                mono={!!mono}
                testId={`${testId}-${key}`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
