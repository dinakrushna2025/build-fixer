import React from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponseDrawer from "@/components/ResponseDrawer";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusChip from "@/components/StatusChip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Loader2, Key, Lock, RotateCcw } from "lucide-react";

export default function PemKms() {
  const { jobId } = useApp();
  const { user } = useAuth();
  const operator = user?.email || "";
  const [job, setJob] = React.useState(jobId);
  React.useEffect(() => setJob(jobId), [jobId]);

  const [expOpen, setExpOpen] = React.useState(true);

  const [extractLoading, setExtractLoading] = React.useState(false);
  const [extractResp, setExtractResp] = React.useState(null);

  const [p8, setP8] = React.useState(null);
  const [p8Loading, setP8Loading] = React.useState(false);
  const [p8Resp, setP8Resp] = React.useState(null);

  const [regenPlatform, setRegenPlatform] = React.useState("android");
  const [regenOpen, setRegenOpen] = React.useState(false);
  const [regenLoading, setRegenLoading] = React.useState(false);
  const [regenResp, setRegenResp] = React.useState(null);

  const doExtract = async () => {
    if (!job) return toast.error("job_id required");
    setExtractLoading(true);
    const r = await safeCall(() =>
      api.post("/pem/extract-upload-key", { job_id: job, operator }),
    );
    setExtractLoading(false);
    setExtractResp(r);
    if (!r.ok) toast.error(r.error);
  };

  const doP8 = async () => {
    if (!p8) return toast.error("Pick a .p8 file");
    const fd = new FormData();
    fd.append("p8_file", p8);
    fd.append("operator", operator || "");
    setP8Loading(true);
    const r = await safeCall(() =>
      api.post("/pem/encrypt-p8", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
    setP8Loading(false);
    setP8Resp(r);
    if (!r.ok) toast.error(r.error);
  };

  const doRegen = async () => {
    setRegenLoading(true);
    const r = await safeCall(() =>
      api.post("/pem/force-regen", {
        job_id: job,
        platform: regenPlatform,
        operator,
      }),
    );
    setRegenLoading(false);
    setRegenOpen(false);
    setRegenResp(r);
    if (!r.ok) toast.error(r.error);
    else toast.success(`Force-regen queued for ${regenPlatform}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="PEM / KMS Tools"
        subtitle="Advanced flows. These run kubectl exec against the deployer pod, gsutil against GCS, and openssl locally."
        badge={<StatusChip severity="red">advanced · destructive</StatusChip>}
      />

      <div className="rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
        <div className="text-sm text-red-900 dark:text-red-200 leading-relaxed">
          These tools touch KMS-encrypted material and the credentials DB. In the preview sandbox,{" "}
          <span className="mono">kubectl</span> / <span className="mono">gsutil</span> aren&apos;t
          available -- calls will return <span className="mono">reachable=false</span>. Deploy
          this tool onto the jumpbox / VPN host to run for real.
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">job_id</label>
          <Input
            data-testid="pem-job-input"
            value={job}
            onChange={(e) => setJob(e.target.value)}
            className="mono mt-1.5 max-w-xl"
          />
        </CardContent>
      </Card>

      {/* Extract upload-key PEM */}
      <Collapsible open={expOpen} onOpenChange={setExpOpen}>
        <Card data-testid="extract-pem-card">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Key className="h-4 w-4" /> Extract upload-key PEM
              </CardTitle>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${expOpen ? "rotate-180" : ""}`}
              />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                <li>SELECT keystore_password FROM android_app_configs WHERE job_id = :job</li>
                <li>KMS decrypt via kubectl exec (decrypt_password on deployer pod)</li>
                <li>gsutil cp gs://…/job_&lt;JOB&gt;/keystore.p12 /tmp</li>
                <li>openssl pkcs12 → x509 -outform PEM</li>
              </ol>
              <Button
                onClick={doExtract}
                disabled={extractLoading || !job}
                data-testid="extract-pem-btn"
              >
                {extractLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                Run chained flow
              </Button>
              {extractResp?.data?.pem && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Public upload-key PEM (safe to email)</div>
                  <textarea
                    data-testid="extract-pem-output"
                    readOnly
                    className="mono w-full text-xs h-64 p-3 rounded-md border border-border bg-secondary/40"
                    value={extractResp.data.pem}
                  />
                </div>
              )}
              {extractResp && (
                <ResponseDrawer
                  title="Chained flow response"
                  status={extractResp.status}
                  data={extractResp.data}
                  error={extractResp.error}
                  testId="extract-pem-response"
                />
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* .p8 encrypt */}
      <Card data-testid="p8-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4" /> Encrypt .p8 for DB (iOS)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            Turns a raw .p8 file (App Store Connect API key) into a{" "}
            <span className="mono">kms::</span> blob you can paste into the DB.
          </p>
          <input
            type="file"
            accept=".p8"
            data-testid="p8-file-input"
            onChange={(e) => setP8(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary/80"
          />
          <Button onClick={doP8} disabled={p8Loading || !p8} data-testid="p8-encrypt-btn">
            {p8Loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Encrypt
          </Button>
          {p8Resp?.data?.kms_blob && (
            <div className="rounded-md border border-border bg-secondary/40 p-3 space-y-1">
              <div className="text-xs text-muted-foreground">kms:: blob</div>
              <div className="mono text-xs break-all">{p8Resp.data.kms_blob}</div>
            </div>
          )}
          {p8Resp && (
            <ResponseDrawer
              title="Encrypt response"
              status={p8Resp.status}
              data={p8Resp.data}
              error={p8Resp.error}
              testId="p8-response"
            />
          )}
        </CardContent>
      </Card>

      {/* Force regen SQL */}
      <Card data-testid="regen-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-red-600" /> Force-regen SQL
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            Executes an UPDATE that wipes the stored artifact so the next build regenerates it. Two
            variants:
          </p>
          <div className="rounded-md border border-border bg-secondary/40 p-3 mono text-xs space-y-1">
            <div>
              <span className="text-muted-foreground">iOS BYO-team cert regen:</span> UPDATE
              ios_app_configs SET profile_base64 = '' WHERE job_id = :job
            </div>
            <div>
              <span className="text-muted-foreground">Android fresh Go keystore:</span> UPDATE
              android_app_configs SET keystore_path = NULL WHERE job_id = :job
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="platform"
                checked={regenPlatform === "ios"}
                onChange={() => setRegenPlatform("ios")}
                data-testid="regen-platform-ios"
              />
              iOS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="platform"
                checked={regenPlatform === "android"}
                onChange={() => setRegenPlatform("android")}
                data-testid="regen-platform-android"
              />
              Android
            </label>
          </div>
          <Button
            variant="destructive"
            onClick={() => setRegenOpen(true)}
            disabled={!job}
            data-testid="regen-submit"
          >
            <RotateCcw className="h-4 w-4" /> Force regenerate
          </Button>
          {regenResp && (
            <ResponseDrawer
              title="Regen response"
              status={regenResp.status}
              data={regenResp.data}
              error={regenResp.error}
              testId="regen-response"
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title={`Force-regen ${regenPlatform.toUpperCase()}`}
        description={`Runs an UPDATE against ${
          regenPlatform === "ios" ? "ios_app_configs" : "android_app_configs"
        } that resets the artifact for job ${job}. The next build will regenerate it. Cannot be undone from this tool.`}
        confirmValue={job}
        confirmLabel="Force regenerate"
        onConfirm={doRegen}
        loading={regenLoading}
        testId="regen-confirm"
      />
    </div>
  );
}
