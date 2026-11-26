import React from "react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Search, Plus, Trash2 } from "lucide-react";

const TYPES = ["A", "CNAME", "TXT", "MX"];

function Out({ data }) {
  if (!data) return null;
  const body = data.body != null ? data.body : data;
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  return <pre className="text-[11px] bg-secondary rounded p-2 overflow-x-auto max-h-96 whitespace-pre-wrap">{text}</pre>;
}

export default function DnsRecords() {
  const [domain, setDomain] = React.useState("");
  const [zone, setZone] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  // add
  const [aType, setAType] = React.useState("A");
  const [aHost, setAHost] = React.useState("@");
  const [aValue, setAValue] = React.useState("");
  const [hostChange, setHostChange] = React.useState(false);
  const [apexMx, setApexMx] = React.useState(false);
  const [addOut, setAddOut] = React.useState(null);
  // delete
  const [dType, setDType] = React.useState("A");
  const [dHost, setDHost] = React.useState("@");
  const [dValue, setDValue] = React.useState("");
  const [dHostChange, setDHostChange] = React.useState(false);
  const [delOut, setDelOut] = React.useState(null);

  const d = () => domain.trim().replace(/\.$/, "");

  const readZone = async () => {
    if (!d()) return toast.error("Enter domain");
    setBusy("zone"); setZone(null);
    const r = await safeCall(() => api.post("/dns/zone", { domain: d() }));
    setBusy("");
    const b = r.data || {};
    setZone(b);
    if (!r.ok || b.ok === false || (b.status_code && b.status_code >= 400)) toast.error((b.body && (b.body.detail || b.body.error)) || b.error || "Zone read failed");
    else toast.success("Zone loaded");
  };

  const addRec = async () => {
    if (!d() || !aValue.trim()) return toast.error("Domain and value required");
    const rec = { type: aType, host: aHost.trim() || "@", value: aValue.trim() };
    if (!window.confirm("Add " + aType + " record " + rec.host + " -> " + rec.value + " on " + d() + " ?")) return;
    setBusy("add"); setAddOut(null);
    const r = await safeCall(() => api.post("/dns/add", { domain: d(), records: [rec], allow_hosting_change: hostChange, allow_apex_mx: apexMx }));
    setBusy("");
    const b = r.data || {};
    setAddOut(b);
    if (!r.ok || b.ok === false || (b.status_code && b.status_code >= 400)) toast.error((b.body && (b.body.detail || b.body.error)) || b.error || "Add failed");
    else { toast.success("Record added"); readZone(); }
  };

  const delRec = async () => {
    if (!d() || !dValue.trim()) return toast.error("Domain and value required");
    if (!window.confirm("Delete " + dType + " record " + (dHost.trim() || "@") + " = " + dValue.trim() + " from " + d() + " ? Read the zone first and copy the exact stored value.")) return;
    setBusy("del"); setDelOut(null);
    const r = await safeCall(() => api.post("/dns/delete", { domain: d(), type: dType, host: dHost.trim() || "@", value: dValue.trim(), allow_hosting_change: dHostChange }));
    setBusy("");
    const b = r.data || {};
    setDelOut(b);
    if (!r.ok || b.ok === false || (b.status_code && b.status_code >= 400)) toast.error((b.body && (b.body.detail || b.body.error)) || b.error || "Delete failed");
    else { toast.success("Record deleted"); readZone(); }
  };

  const Sel = ({ value, onChange }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
      {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="DNS Records" subtitle="Read and edit A, CNAME, TXT and MX records on a domain bought through Emergent. Always read the zone before and after any change." />

      <Card><CardContent className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Domain and current zone</div>
        <div className="flex items-center gap-2 max-w-xl">
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com (Emergent bought only)" className="h-9" data-testid="dns-domain" />
          <Button size="sm" variant="outline" onClick={readZone} disabled={busy === "zone" || !d()}>
            {busy === "zone" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Read zone
          </Button>
        </div>
        <Out data={zone} />
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Add a record</div>
        <div className="flex flex-wrap items-center gap-2">
          <Sel value={aType} onChange={setAType} />
          <Input value={aHost} onChange={(e) => setAHost(e.target.value)} placeholder="host (@, www, sub)" className="h-9 w-40" />
          <Input value={aValue} onChange={(e) => setAValue(e.target.value)} placeholder="value (IP or hostname)" className="h-9 flex-1 min-w-[16rem]" />
          <Button size="sm" onClick={addRec} disabled={busy === "add" || !d() || !aValue.trim()}>
            {busy === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
          </Button>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <label className="flex items-center gap-1"><input type="checkbox" checked={hostChange} onChange={(e) => setHostChange(e.target.checked)} /> allow hosting change (@, *, www, linked sub)</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={apexMx} onChange={(e) => setApexMx(e.target.checked)} /> allow apex MX</label>
        </div>
        <p className="text-[11px] text-muted-foreground">A CNAME cannot share a host with any other record, delete the old one first. CNAME at the apex is refused.</p>
        <Out data={addOut} />
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Delete a record</div>
        <div className="flex flex-wrap items-center gap-2">
          <Sel value={dType} onChange={setDType} />
          <Input value={dHost} onChange={(e) => setDHost(e.target.value)} placeholder="host" className="h-9 w-40" />
          <Input value={dValue} onChange={(e) => setDValue(e.target.value)} placeholder="exact stored value" className="h-9 flex-1 min-w-[16rem]" />
          <Button size="sm" variant="destructive" onClick={delRec} disabled={busy === "del" || !d() || !dValue.trim()}>
            {busy === "del" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </Button>
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={dHostChange} onChange={(e) => setDHostChange(e.target.checked)} /> allow hosting change</label>
        <p className="text-[11px] text-muted-foreground">Deletes exactly one record per call. Deleting * also stops every subdomain linked to an Emergent app.</p>
        <Out data={delOut} />
      </CardContent></Card>
    </div>
  );
}
