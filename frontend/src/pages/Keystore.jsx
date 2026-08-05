import React from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponseDrawer from "@/components/ResponseDrawer";
import StatusChip from "@/components/StatusChip";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, KeyRound, Upload, Fingerprint, Download } from "lucide-react";

export default function Keystore() {
  const { jobId } = useApp();
  const { user } = useAuth();
  const operator = user?.email || "";
  const [job, setJob] = React.useState(jobId);
  const [userId, setUserId] = React.useState("");
  const [autoResolved, setAutoResolved] = React.useState(false);

  React.useEffect(() => setJob(jobId), [jobId]);

  // Auto-resolve owner user_id from /diagnose when job changes
  React.useEffect(() => {
    if (!job) return;
    let cancelled = false;
    (async () => {
      const r = await safeCall(() => api.post("/diagnose", { job_id: job }));
      if (cancelled) return;
      if (r.ok && r.data?.resolved_user_id) {
        setUserId(r.data.resolved_user_id);
        setAutoResolved(true);
      } else {
        setAutoResolved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job]);

  const [lookup, setLookup] = React.useState(null);
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const doLookup = async () => {
    if (!job || !userId) return toast.error("job_id and user_id required");
    setLookupLoading(true);
    const r = await safeCall(() =>
      api.get(`/keystore/${encodeURIComponent(job)}`, { params: { user_id: userId } }),
    );
    setLookupLoading(false);
    setLookup(r);
    if (!r.ok) toast.error(r.error);
  };

  const pemData = lookup?.data?.body?.pem_data;
  const pemPkg = lookup?.data?.body?.package_name;
  const downloadPem = () => {
    if (!pemData) return;
    const blob = new Blob([pemData], { type: "application/x-pem-file" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pemPkg || job || "keystore"}.pem`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const [file, setFile] = React.useState(null);
  const [uploadResp, setUploadResp] = React.useState(null);
  const [uploadLoading, setUploadLoading] = React.useState(false);
  const doUpload = async () => {
    if (!file) return toast.error("Pick a .pem / .jks / .p12 file");
    if (file.name.toLowerCase().endsWith(".der")) {
      return toast.error(
        "DER files are public certificates only — can't sign. Upload the ORIGINAL keystore (.jks, .pem, or .p12).",
      );
    }
    if (!job || !userId) return toast.error("job_id + user_id required");
    const fd = new FormData();
    fd.append("pem_file", file);
    fd.append("user_id", userId);
    fd.append("operator", operator || "");
    setUploadLoading(true);
    const r = await safeCall(() =>
      api.post(`/keystore/${encodeURIComponent(job)}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
    setUploadLoading(false);
    setUploadResp(r);
    if (!r.ok) return toast.error(r.error);
    if (r.data?.status_code >= 400) toast.error(`Deployer returned HTTP ${r.data.status_code}`);
    else toast.success(r.data?.converted_note || "Keystore uploaded");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Keystore Manager"
        subtitle="Look up or upload the Android upload keystore for a job. .jks / .p12 files are auto-converted to .pem before upload. Fingerprint is computed on success."
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                job_id
              </label>
              <Input
                data-testid="ks-job-input"
                value={job}
                onChange={(e) => setJob(e.target.value)}
                className="mono mt-1.5"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                X-User-ID header (job owner user_id){" "}
                {autoResolved && (
                  <StatusChip severity="green">auto-resolved</StatusChip>
                )}
              </label>
              <Input
                data-testid="ks-user-input"
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  setAutoResolved(false);
                }}
                className="mono mt-1.5"
                placeholder="customer's user_id (NOT operator)"
              />
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                Must be the customer&apos;s user_id (from android_app_configs.user_id),
                not your login. Sending the wrong user_id → 403.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="ks-lookup-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Lookup
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="mono text-xs text-muted-foreground">
              GET /api/v1/android/jobs/{job || "…"}/keystore
            </div>
            <Button
              onClick={doLookup}
              disabled={lookupLoading || !job || !userId}
              data-testid="ks-lookup-btn"
            >
              {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look up"}
            </Button>
            {pemData && (
              <Button
                variant="outline"
                onClick={downloadPem}
                className="ml-2"
                data-testid="ks-download-pem"
              >
                <Download className="h-4 w-4" /> Download .pem
              </Button>
            )}
            {lookup && (
              <ResponseDrawer
                title="Lookup response"
                status={lookup.data?.status_code}
                data={lookup.data}
                error={lookup.error}
                defaultOpen
                testId="ks-lookup-response"
              />
            )}
          </CardContent>
        </Card>

        <Card data-testid="ks-upload-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="mono text-xs text-muted-foreground">
              POST /api/v1/android/jobs/{job || "…"}/keystore (multipart)
            </div>
            <input
              type="file"
              accept=".pem,.jks,.p12"
              data-testid="ks-file-input"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary/80"
            />
            {file && (
              <div className="text-xs mono text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(1)} KiB
              </div>
            )}
            <Button
              onClick={doUpload}
              disabled={uploadLoading || !file}
              data-testid="ks-upload-btn"
            >
              {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
            </Button>
            {uploadResp?.data?.auto_fingerprint?.sha1 && (
              <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <Fingerprint className="h-3.5 w-3.5" /> Auto-verified fingerprint
                </div>
                <div className="mono break-all">SHA-1: {uploadResp.data.auto_fingerprint.sha1}</div>
                <div className="mono break-all">SHA-256: {uploadResp.data.auto_fingerprint.sha256}</div>
              </div>
            )}
            {uploadResp && (
              <ResponseDrawer
                title="Upload response"
                status={uploadResp.data?.status_code}
                data={uploadResp.data}
                error={uploadResp.error}
                defaultOpen
                testId="ks-upload-response"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
