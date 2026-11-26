import React from "react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeCall, api } from "@/api";
import { useAccess } from "@/context/AccessContext";
import { toast } from "sonner";
import { Loader2, Search, Check, X, Pencil, ShieldCheck } from "lucide-react";

const PAGE_SIZE = 6;

export default function AccessAdmin() {
  const acc = useAccess();
  const isAdmin = !!acc?.access?.is_admin;
  const [loading, setLoading] = React.useState(true);
  const [tabs, setTabs] = React.useState([]);
  const [reqs, setReqs] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [popup, setPopup] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [apPage, setApPage] = React.useState(0);
  const [rjPage, setRjPage] = React.useState(0);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const r = await safeCall(() => api.get("/access/requests"));
    if (!silent) setLoading(false);
    if (!r.ok) { if (!silent) toast.error(r.error || "Failed to load"); return; }
    setTabs(r.data.tabs || []);
    setReqs(r.data.requests || []);
  }, []);
  React.useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  // auto reload: refresh the request list in the background so new requests and
  // granted access show up without a manual refresh
  React.useEffect(() => {
    if (!isAdmin) return;
    const id = setInterval(() => { load(true); }, 15000);
    return () => clearInterval(id);
  }, [isAdmin, load]);

  if (!isAdmin) {
    return <div className="py-16 text-center text-muted-foreground">Admins only.</div>;
  }

  const labelOf = (k) => (tabs.find((t) => t.key === k) || {}).label || k;
  const match = (u) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (u.name || "").toLowerCase().includes(s) || (u.email || "").toLowerCase().includes(s);
  };
  const pending = reqs.filter((u) => u.status === "pending" && match(u));
  const approved = reqs.filter((u) => u.status === "approved" && match(u));
  const rejected = reqs.filter((u) => u.status === "denied" && match(u));

  const apPages = Math.max(1, Math.ceil(approved.length / PAGE_SIZE));
  const rjPages = Math.max(1, Math.ceil(rejected.length / PAGE_SIZE));
  const apP = Math.min(apPage, apPages - 1);
  const rjP = Math.min(rjPage, rjPages - 1);
  const apView = approved.slice(apP * PAGE_SIZE, apP * PAGE_SIZE + PAGE_SIZE);
  const rjView = rejected.slice(rjP * PAGE_SIZE, rjP * PAGE_SIZE + PAGE_SIZE);

  const openPopup = (u, mode) => setPopup({ email: u.email, name: u.name, mode, sel: new Set(u.allowed_tabs || []) });
  const toggle = (key) => setPopup((p) => {
    const s = new Set(p.sel); if (s.has(key)) s.delete(key); else s.add(key);
    return { ...p, sel: s };
  });
  const setAll = (on) => setPopup((p) => ({ ...p, sel: on ? new Set(tabs.map((t) => t.key)) : new Set() }));

  const save = async () => {
    setBusy(true);
    const r = await safeCall(() => api.post("/access/approve", { email: popup.email, tabs: Array.from(popup.sel), status: "approved" }));
    setBusy(false);
    if (!r.ok || r.data?.ok === false) return toast.error(r.data?.error || r.error || "Failed");
    toast.success("Saved " + popup.email);
    setPopup(null); load(); acc?.refresh && acc.refresh();
  };
  const deny = async (email) => {
    const r = await safeCall(() => api.post("/access/approve", { email, tabs: [], status: "denied" }));
    if (!r.ok || r.data?.ok === false) return toast.error(r.data?.error || r.error || "Failed");
    toast.success("Denied " + email); load(); acc?.refresh && acc.refresh();
  };

  const Row = ({ u, actions }) => (
    <div className="border border-border rounded-md p-3 flex items-center gap-2">
      <div className="leading-tight min-w-0">
        <div className="text-sm font-medium truncate">{u.name || u.email}</div>
        <div className="text-[11px] mono text-muted-foreground truncate">{u.email}</div>
        {u.status === "approved" && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(u.allowed_tabs || []).length === 0 && <span className="text-[11px] text-muted-foreground">no tabs</span>}
            {(u.allowed_tabs || []).map((k) => <span key={k} className="text-[10px] bg-secondary rounded px-2 py-0.5">{labelOf(k)}</span>)}
            {u.approved_by && <span className="text-[10px] text-muted-foreground">by {u.approved_by}</span>}
          </div>
        )}
        {u.status === "denied" && u.approved_by && (
          <div className="text-[10px] text-muted-foreground mt-1">denied by {u.approved_by}</div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <span className={"text-[10px] px-2 py-0.5 rounded-full " + (u.status === "approved" ? "bg-emerald-500/15 text-emerald-600" : u.status === "denied" ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600")}>{u.status}</span>
        {actions}
      </div>
    </div>
  );

  const Pager = ({ page, pages, setPage }) => (
    pages <= 1 ? null : (
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
        <span className="text-[11px] text-muted-foreground">{page + 1} / {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>Next</Button>
      </div>
    )
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Access management" subtitle="Approve who can use the tool and pick exactly which tabs each person sees. Approved and rejected history is kept below and stays editable." />

      <div className="flex items-center gap-2 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="h-9" data-testid="access-search" />
        <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
      </div>

      {loading ? (
        <div className="py-16 grid place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <Card><CardContent className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Requests ({pending.length})</div>
            {!pending.length && <p className="text-sm text-muted-foreground">No pending requests.</p>}
            {pending.map((u) => (
              <Row key={u.email} u={u} actions={<>
                <Button size="sm" onClick={() => openPopup(u, "approve")} data-testid={"approve-" + u.email}><Check className="h-3.5 w-3.5" /> Approve</Button>
                <Button size="sm" variant="outline" onClick={() => deny(u.email)}>Deny</Button>
              </>} />
            ))}
          </CardContent></Card>

          <Card><CardContent className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Approved ({approved.length})</div>
            {!approved.length && <p className="text-sm text-muted-foreground">No one approved yet.</p>}
            {apView.map((u) => (
              <Row key={u.email} u={u} actions={
                <Button size="sm" variant="outline" onClick={() => openPopup(u, "edit")} data-testid={"edit-" + u.email}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
              } />
            ))}
            <Pager page={apP} pages={apPages} setPage={setApPage} />
          </CardContent></Card>

          <Card><CardContent className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Rejected ({rejected.length})</div>
            {!rejected.length && <p className="text-sm text-muted-foreground">No one rejected.</p>}
            {rjView.map((u) => (
              <Row key={u.email} u={u} actions={
                <Button size="sm" variant="outline" onClick={() => openPopup(u, "approve")} data-testid={"reapprove-" + u.email}><Check className="h-3.5 w-3.5" /> Approve</Button>
              } />
            ))}
            <Pager page={rjP} pages={rjPages} setPage={setRjPage} />
          </CardContent></Card>
        </>
      )}

      {popup && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-6 overflow-y-auto" data-testid="tab-popup">
          <div className="bg-card border border-border rounded-lg w-full max-w-lg my-8 shadow-xl">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div className="leading-tight">
                <div className="text-sm font-semibold">{popup.mode === "edit" ? "Edit access" : "Approve access"}</div>
                <div className="text-[11px] mono text-muted-foreground">{popup.email}</div>
              </div>
              <button onClick={() => setPopup(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Select the tabs this user can see</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAll(true)} className="text-[11px] text-primary hover:underline">All</button>
                  <button onClick={() => setAll(false)} className="text-[11px] text-muted-foreground hover:underline">None</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {tabs.map((t) => {
                  const on = popup.sel.has(t.key);
                  return (
                    <button key={t.key} onClick={() => toggle(t.key)} className={"flex items-center gap-2 text-xs rounded-md border px-2 py-1.5 text-left " + (on ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/70 hover:bg-secondary")}>
                      <span className={"h-3.5 w-3.5 rounded border grid place-items-center shrink-0 " + (on ? "bg-primary border-primary text-primary-foreground" : "border-border")}>{on && <Check className="h-2.5 w-2.5" />}</span>
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={save} disabled={busy} data-testid="popup-done">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Done
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPopup(null)} disabled={busy}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
