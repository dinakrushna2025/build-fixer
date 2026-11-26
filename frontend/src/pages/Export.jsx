import React from "react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, DatabaseBackup, Copy, RefreshCw, Link as LinkIcon, Search } from "lucide-react";

function pickId(o) {
  if (!o || typeof o !== "object") return "";
  return o.deployment_id || o.deploymentId || o.id || o.ID || o.deployment?.id || "";
}

export default function Export() {
  const [slug, setSlug] = React.useState("");
  const [resolved, setResolved] = React.useState(null);  // raw resolve body
  const [deplId, setDeplId] = React.useState("");
  const [job, setJob] = React.useState(null);
  const [link, setLink] = React.useState(null);
  const [busy, setBusy] = React.useState("");

  const jid = (job && (job.id || job.export_job_id)) || "";
  const status = (job && job.status) || "";
  const url = (link && (link.download_url || link.url)) || "";
  const exp = (link && (link.expires_at || link.expiresAt)) || "";

  const copy = (t) => { try { navigator.clipboard.writeText(t); toast.success("Copied"); } catch (e) {} };

  const resolve = async () => {
    const s = slug.trim();
    if (!s) return toast.error("Enter app slug");
    setBusy("resolve"); setResolved(null);
    const r = await safeCall(() => api.post("/export/resolve", { identifier: s }));
    setBusy("");
    const b = (r.data && r.data.body) || r.data;
    if (!r.ok || r.data?.ok === false || (r.data?.status_code && r.data.status_code >= 400)) {
      return toast.error((b && (b.detail || b.error)) || r.data?.error || r.error || "Resolve failed");
    }
    setResolved(b);
    const id = pickId(b);
    if (id) { setDeplId(id); toast.success("Deployment id found"); }
    else toast.message("Resolved, but no obvious id field - check the details below");
  };

  const create = async () => {
    const id = deplId.trim();
    if (!id) return toast.error("Enter / resolve a deployment id");
    setBusy("create"); setLink(null); setJob(null);
    const r = await safeCall(() => api.post("/export/create", { slug: slug.trim(), identifier: id }));
    setBusy("");
    const b = (r.data && r.data.body) || r.data;
    if (!r.ok || r.data?.ok === false || (r.data?.status_code && r.data.status_code >= 400)) {
      return toast.error((b && (b.detail || b.error)) || r.data?.error || r.error || "Create failed");
    }
    setJob(b); toast.success("Export started");
  };
  const refresh = async () => {
    if (!jid) return;
    setBusy("status");
    const r = await safeCall(() => api.post("/export/status", { job_id: jid }));
    setBusy("");
    const b = (r.data && r.data.body) || r.data;
    if (!r.ok || r.data?.ok === false) return toast.error(r.data?.error || r.error || "Status failed");
    setJob(b);
  };
  const getLink = async () => {
    if (!jid) return;
    setBusy("link");
    const r = await safeCall(() => api.post("/export/link", { job_id: jid }));
    setBusy("");
    const b = (r.data && r.data.body) || r.data;
    if (!r.ok || r.data?.ok === false || (r.data?.status_code && r.data.status_code >= 400)) {
      return toast.error((b && (b.detail || b.error)) || r.data?.error || r.error || "Link failed");
    }
    setLink(b);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="BSON Export" subtitle="Resolve a slug to its deployment id, then generate a verified BSON archive and hand the user a time limited download link." />

      <Card><CardContent className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">1. Slug to deployment id</div>
        <div className="flex items-center gap-2 max-w-xl">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="app slug, e.g. siquijor-sanctuary" className="h-9" data-testid="export-slug" />
          <Button size="sm" variant="outline" onClick={resolve} disabled={busy === "resolve"} data-testid="export-resolve">
            {busy === "resolve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Resolve
          </Button>
        </div>
        {resolved && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 max-w-xl">
              <Input readOnly value={pickId(resolved) || "(no id field)"} className="h-9 mono text-xs" data-testid="export-resolved-id" />
              <Button size="sm" variant="outline" onClick={() => copy(pickId(resolved))} disabled={!pickId(resolved)}><Copy className="h-3.5 w-3.5" /> Copy</Button>
            </div>
            <pre className="text-[11px] bg-secondary rounded p-2 overflow-x-auto max-h-56">{JSON.stringify(resolved, null, 2)}</pre>
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">2. Deployment id to export</div>
        <div className="flex items-center gap-2 max-w-xl">
          <Input value={deplId} onChange={(e) => setDeplId(e.target.value)} placeholder="paste deployment id here" className="h-9 mono text-xs" data-testid="export-deplid" />
          <Button size="sm" onClick={create} disabled={busy === "create"} data-testid="export-start">
            {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5" />} Start export
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">20GB cap; the archive is verified by a restore replay before any link is issued.</p>
      </CardContent></Card>

      {job && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">3. Job</div>
            <Button size="sm" variant="outline" onClick={refresh} disabled={busy === "status"}>
              {busy === "status" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh status
            </Button>
          </div>
          <div className="text-sm">Job id: <span className="mono">{jid || "—"}</span></div>
          <div className="text-sm">Status: <span className="font-medium">{status || "—"}</span></div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={getLink} disabled={busy === "link" || status !== "ready"}>
              {busy === "link" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />} Get download link
            </Button>
            {status !== "ready" && <span className="text-[11px] text-muted-foreground">Link available once status is ready.</span>}
          </div>
          <pre className="text-[11px] bg-secondary rounded p-2 overflow-x-auto max-h-72">{JSON.stringify(job, null, 2)}</pre>
        </CardContent></Card>
      )}

      {url && (
        <Card><CardContent className="p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">4. Download link (give this to the user)</div>
          <div className="flex items-center gap-2">
            <Input readOnly value={url} className="h-9 mono text-xs" data-testid="export-link" />
            <Button size="sm" variant="outline" onClick={() => copy(url)}><Copy className="h-3.5 w-3.5" /> Copy</Button>
          </div>
          {exp && <p className="text-[11px] text-muted-foreground">Expires: {String(exp)}</p>}
        </CardContent></Card>
      )}
    </div>
  );
}
