import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InfoRow from "@/components/InfoRow";
import ResponseDrawer from "@/components/ResponseDrawer";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusChip from "@/components/StatusChip";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Globe, Trash2 } from "lucide-react";

export default function Domain() {
  const { operator } = useApp();
  const [domain, setDomain] = React.useState("");
  const [dns, setDns] = React.useState(null);
  const [resp, setResp] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const check = async () => {
    if (!domain) return toast.error("domain required");
    setBusy("check");
    const r = await safeCall(() => api.post("/domain/dns", { domain: domain.trim() }));
    setBusy(""); setResp(r);
    if (r.ok) setDns(r.data); else toast.error(typeof r.error === "string" ? r.error : "Check failed");
  };
  const remove = async () => {
    setOpen(false);
    if (!domain) return toast.error("domain required");
    setBusy("remove");
    const r = await safeCall(() => api.post("/domain/remove", { domain: domain.trim(), operator }));
    setBusy(""); setResp(r);
    const sc = r.data?.status_code;
    if (r.ok && sc && sc < 400) toast.success("Domain removed");
    else toast.error(r.data?.error || r.data?.body?.error || (typeof r.error==="string"?r.error:("HTTP " + sc)));
  };

  const sys = dns?.system;
  return (
    <div className="space-y-6">
      <PageHeader title="Domain" subtitle="Enter a domain to see where it points and whether it is connected in our system, then remove a stale mapping so the user can re-add it. Owner is auto-resolved." badge={<StatusChip severity="red">remove is destructive</StatusChip>} />
      <Card><CardContent className="p-4 space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">domain</label>
          <Input value={domain} onChange={(e)=>setDomain(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&check()} className="mono mt-1.5 max-w-xl" placeholder="app.example.com" data-testid="dom-domain-input" />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={check} disabled={busy==="check"||!domain} data-testid="dom-check-btn">
            {busy==="check"?<Loader2 className="h-4 w-4 animate-spin"/>:<Globe className="h-4 w-4"/>} Check domain
          </Button>
          <Button variant="destructive" onClick={()=>setOpen(true)} disabled={busy==="remove"||!domain} data-testid="dom-remove-btn">
            {busy==="remove"?<Loader2 className="h-4 w-4 animate-spin"/>:<Trash2 className="h-4 w-4"/>} Remove domain
          </Button>
        </div>
      </CardContent></Card>

      {dns && (
        <Card data-testid="dom-result">
          <CardHeader className="pb-3"><div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Result</CardTitle>
            {sys ? <StatusChip severity={sys.deleted?"amber":"green"}>{sys.deleted?"in DB (marked deleted)":"connected in our system"}</StatusChip> : <StatusChip severity="red">not in our system</StatusChip>}
          </div></CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">DNS (where it points now)</div>
              <div className="divide-y divide-border">
                <InfoRow label="IP(s)" value={(dns.a_records||[]).join(", ") || "none"} mono />
                <InfoRow label="target / CNAME" value={dns.canonical || "none"} mono />
                {dns.error && <InfoRow label="dns error" value={dns.error} />}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Our system (deployer DB)</div>
              {sys ? (
                <div className="divide-y divide-border">
                  <InfoRow label="owner user_id" value={sys.user_id} mono />
                  <InfoRow label="verified" value={String(sys.verified)} />
                  <InfoRow label="deleted flag" value={String(sys.deleted)} />
                  <InfoRow label="provider" value={sys.provider || "-"} />
                  <InfoRow label="cf ssl status" value={sys.cf_ssl_status || "-"} />
                  <InfoRow label="cf hostname id" value={sys.cf_custom_hostname_id || "-"} mono />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-2">Domain not found in the deployer DB (nothing to remove, or already removed).</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {resp && <ResponseDrawer title="response" status={resp.data?.status_code} data={resp.data} error={typeof resp.error==="string"?resp.error:undefined} testId="dom-response" />}
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Remove custom domain"
        description={"This removes " + domain + " from deployer + Cloudflare (owner auto-resolved). The user can then re-add it."}
        confirmValue={domain} confirmLabel="Remove domain" onConfirm={remove} loading={busy==="remove"} testId="dom-confirm" />
    </div>
  );
}
