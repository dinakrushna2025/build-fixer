import React from "react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Search, Wrench, ShieldCheck } from "lucide-react";

function Out({ data }) {
  if (!data) return null;
  const text = data.text || (data.body != null ? (typeof data.body === "string" ? data.body : JSON.stringify(data.body, null, 2)) : JSON.stringify(data, null, 2));
  return <pre className="text-[11px] bg-secondary rounded p-2 overflow-x-auto max-h-96 whitespace-pre-wrap">{text}</pre>;
}

export default function DomainFix() {
  const [ident, setIdent] = React.useState("");
  const [status, setStatus] = React.useState(null);
  const [fixOut, setFixOut] = React.useState(null);
  const [vDomain, setVDomain] = React.useState("");
  const [vApp, setVApp] = React.useState("");
  const [vTicket, setVTicket] = React.useState("");
  const [vOut, setVOut] = React.useState(null);
  const [busy, setBusy] = React.useState("");

  const run = async (which, path, payload, setter, okMsg) => {
    setBusy(which); setter(null);
    const r = await safeCall(() => api.post(path, payload));
    setBusy("");
    const b = r.data || {};
    setter(b);
    if (!r.ok || b.ok === false) toast.error(b.error || b.text || r.error || "Failed");
    else toast.success(okMsg);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Domain Fix / SSL" subtitle="Repair a custom domain that shows Deployment not found, and re run SSL and domain verification on the customer's behalf." />

      <Card><CardContent className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">1. Status and mapping fix</div>
        <div className="flex items-center gap-2 max-w-xl">
          <Input value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="domain or app, e.g. example.com" className="h-9" data-testid="domainfix-ident" />
          <Button size="sm" variant="outline" onClick={() => run("status", "/domainfix/status", { identifier: ident.trim() }, setStatus, "Status loaded")} disabled={busy === "status" || !ident.trim()}>
            {busy === "status" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Check status
          </Button>
          <Button size="sm" onClick={() => { if (window.confirm("Patch the Cloudflare hostname metadata for " + ident.trim() + "? This can trigger a secrets reconcile and redeploy.")) run("fix", "/domainfix/fix", { identifier: ident.trim() }, setFixOut, "Mapping fix done"); }} disabled={busy === "fix" || !ident.trim()}>
            {busy === "fix" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />} Fix mapping
          </Button>
        </div>
        <Out data={status} />
        <Out data={fixOut} />
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">2. Re run verify / SSL</div>
        <div className="grid gap-2 max-w-xl">
          <Input value={vDomain} onChange={(e) => setVDomain(e.target.value)} placeholder="domain exactly as the customer added it" className="h-9" />
          <Input value={vApp} onChange={(e) => setVApp(e.target.value)} placeholder="app name or job id the domain points at" className="h-9" />
          <Input value={vTicket} onChange={(e) => setVTicket(e.target.value)} placeholder="Trinity ticket number" className="h-9" />
          <div>
            <Button size="sm" onClick={() => run("verify", "/domainfix/verify", { domain: vDomain.trim(), identifier: vApp.trim(), ticket: vTicket.trim() }, setVOut, "Verify triggered")} disabled={busy === "verify" || !vDomain.trim() || !vApp.trim() || !vTicket.trim()}>
              {busy === "verify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Verify domain
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">ssl_pending means DNS is right and the certificate is still issuing. Check status again after about 30 seconds.</p>
        <Out data={vOut} />
      </CardContent></Card>
    </div>
  );
}
