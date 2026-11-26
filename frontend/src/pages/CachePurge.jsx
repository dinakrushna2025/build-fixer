import React from "react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Eraser } from "lucide-react";

export default function CachePurge() {
  const [ident, setIdent] = React.useState("");
  const [out, setOut] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const purge = async () => {
    const id = ident.trim();
    if (!id) return toast.error("Enter app name, app id, or domain");
    if (!window.confirm("Purge the crawler cache for " + id + "? Fix the upstream cause first, or the next crawl re caches the same bad response.")) return;
    setBusy(true); setOut(null);
    const r = await safeCall(() => api.post("/cachepurge/run", { identifier: id }));
    setBusy(false);
    const b = r.data || {};
    setOut(b);
    if (!r.ok || b.ok === false) toast.error(b.error || b.text || r.error || "Purge failed");
    else toast.success("Purge requested");
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Cache Purge" subtitle="Purge an app's crawler (SEO prerender) cache so the next crawl re renders every path. Fix the upstream block first." />
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 max-w-xl">
          <Input value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="app name, app id, or custom domain" className="h-9" data-testid="cachepurge-ident" />
          <Button size="sm" onClick={purge} disabled={busy || !ident.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />} Purge cache
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">A status of purged or nothing_cached is clean. Any incomplete_ status means the cache was not fully seen, so do not report it as clear.</p>
        {out && <pre className="text-[11px] bg-secondary rounded p-2 overflow-x-auto max-h-96 whitespace-pre-wrap">{out.text || JSON.stringify(out, null, 2)}</pre>}
      </CardContent></Card>
    </div>
  );
}
