import React from "react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Eye } from "lucide-react";

export default function SecretsView() {
  const [app, setApp] = React.useState("");
  const [out, setOut] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const view = async () => {
    const a = app.trim();
    if (!a) return toast.error("Enter app name");
    setBusy(true); setOut(null);
    const r = await safeCall(() => api.post("/secrets/view", { app_name: a }));
    setBusy(false);
    const b = r.data || {};
    setOut(b);
    if (!r.ok || b.ok === false) toast.error(b.error || b.text || r.error || "Lookup failed");
    else toast.success("Secrets loaded");
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Secrets Viewer" subtitle="Read only. List an app's deployed secret names and masked values. There is no edit path here." />
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 max-w-xl">
          <Input value={app} onChange={(e) => setApp(e.target.value)} placeholder="app name (works even if the app is deleted)" className="h-9" data-testid="secrets-app" />
          <Button size="sm" onClick={view} disabled={busy || !app.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} View secrets
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Values come back masked by the deployer. This tab cannot change secrets.</p>
        {out && <pre className="text-[11px] bg-secondary rounded p-2 overflow-x-auto max-h-[32rem] whitespace-pre-wrap">{out.text || JSON.stringify(out, null, 2)}</pre>}
      </CardContent></Card>
    </div>
  );
}
