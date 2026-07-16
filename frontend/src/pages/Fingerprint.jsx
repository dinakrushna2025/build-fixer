import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ResponseDrawer from "@/components/ResponseDrawer";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Fingerprint, Upload, Link as LinkIcon, Database } from "lucide-react";

export default function FingerprintPage() {
  const { jobId } = useApp();
  const [job, setJob] = React.useState(jobId);
  React.useEffect(() => setJob(jobId), [jobId]);

  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookup, setLookup] = React.useState(null);

  const [url, setUrl] = React.useState("");
  const [urlLoading, setUrlLoading] = React.useState(false);
  const [urlResp, setUrlResp] = React.useState(null);

  const [file, setFile] = React.useState(null);
  const [uploadLoading, setUploadLoading] = React.useState(false);
  const [uploadResp, setUploadResp] = React.useState(null);

  const doLookup = async () => {
    if (!job) return toast.error("job_id required");
    setLookupLoading(true);
    const r = await safeCall(() => api.post("/fingerprint/lookup", { job_id: job }));
    setLookupLoading(false);
    setLookup(r);
    if (!r.ok) toast.error(r.error);
  };

  const doUrl = async (u) => {
    const target = u || url;
    if (!target) return toast.error("Pick an APK/AAB URL");
    setUrlLoading(true);
    const r = await safeCall(() => api.post("/fingerprint/from-url", { url: target }));
    setUrlLoading(false);
    setUrlResp(r);
    if (r.ok) toast.success("Fingerprint computed");
    else toast.error(r.error);
  };

  const doUpload = async () => {
    if (!file) return toast.error("Pick an APK/AAB");
    const fd = new FormData();
    fd.append("file", file);
    setUploadLoading(true);
    const r = await safeCall(() =>
      api.post("/fingerprint/from-upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
    setUploadLoading(false);
    setUploadResp(r);
    if (r.ok) toast.success("Fingerprint computed");
    else toast.error(r.error);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signing Fingerprint"
        subtitle="Pull an artifact URL from Redash (union of android_app_configs_v3 + v1) and compute the Play-Console SHA-1 / SHA-256, or paste a URL / upload a file."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" /> Look up artifact by job_id
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                job_id
              </label>
              <Input
                data-testid="fp-job-input"
                value={job}
                onChange={(e) => setJob(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLookup()}
                className="mono mt-1.5"
              />
            </div>
            <Button
              onClick={doLookup}
              disabled={lookupLoading}
              data-testid="fp-lookup-btn"
              className="mb-0"
            >
              {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look up"}
            </Button>
          </div>

          {lookup?.data?.rows?.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs mono">
                <thead className="bg-secondary/50 text-left">
                  <tr>
                    <th className="p-2 font-medium">src</th>
                    <th className="p-2 font-medium">apk_url</th>
                    <th className="p-2 font-medium">aab_url</th>
                    <th className="p-2 font-medium">key_alias</th>
                    <th className="p-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {lookup.data.rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2">{r.src}</td>
                      <td className="p-2 max-w-[260px] truncate" title={r.apk_url}>
                        {r.apk_url || "—"}
                      </td>
                      <td className="p-2 max-w-[260px] truncate" title={r.aab_url}>
                        {r.aab_url || "—"}
                      </td>
                      <td className="p-2">{r.key_alias || "—"}</td>
                      <td className="p-2">
                        {(r.aab_url || r.apk_url) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => doUrl(r.aab_url || r.apk_url)}
                            data-testid={`fp-row-hash-${i}`}
                          >
                            Fingerprint
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lookup && (
            <ResponseDrawer
              title="Redash rows"
              status={lookup.status}
              data={lookup.data}
              error={lookup.error}
              testId="fp-lookup-response"
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="fp-url-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <LinkIcon className="h-4 w-4" /> From URL
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <Input
              data-testid="fp-url-input"
              placeholder="https://…/app.aab"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mono"
            />
            <Button onClick={() => doUrl()} disabled={urlLoading} data-testid="fp-url-btn">
              {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
              Compute
            </Button>
            <FingerprintResult r={urlResp} testId="fp-url-result" />
          </CardContent>
        </Card>

        <Card data-testid="fp-upload-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4" /> From upload
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <input
              type="file"
              accept=".apk,.aab"
              data-testid="fp-file-input"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary/80"
            />
            <Button onClick={doUpload} disabled={uploadLoading || !file} data-testid="fp-upload-btn">
              {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
              Compute
            </Button>
            <FingerprintResult r={uploadResp} testId="fp-upload-result" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FingerprintResult({ r, testId }) {
  if (!r) return null;
  const d = r.data;
  if (!r.ok || !d?.sha1) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400" data-testid={`${testId}-err`}>
        {r.error || "Fingerprint failed"}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3 space-y-1.5 text-xs" data-testid={testId}>
      <div>
        <span className="text-muted-foreground">SHA-1</span>
        <div className="mono break-all font-medium">{d.sha1}</div>
      </div>
      <div>
        <span className="text-muted-foreground">SHA-256</span>
        <div className="mono break-all font-medium">{d.sha256}</div>
      </div>
      {d.subject && (
        <div>
          <span className="text-muted-foreground">Subject</span>
          <div className="mono break-all">{d.subject}</div>
        </div>
      )}
      <div className="pt-1 text-muted-foreground text-[11px]">
        Compare against Google Play Console → App integrity → App signing key certificate.
      </div>
    </div>
  );
}
