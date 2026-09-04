import React from "react";
import { safeCall, api } from "@/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, X, Check, ShieldCheck, Pencil } from "lucide-react";

export default function AccessModal({ open, onClose, onChanged }) {
  const [loading, setLoading] = React.useState(false);
  const [tabs, setTabs] = React.useState([]);
  const [reqs, setReqs] = React.useState([]);
  const [sel, setSel] = React.useState({});
  const [editing, setEditing] = React.useState(null);
  const [busy, setBusy] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    const r = await safeCall(() => api.get("/access/requests"));
    setLoading(false);
    if (!r.ok) return toast.error(r.error || "Failed to load requests");
    setTabs(r.data.tabs || []);
    setReqs(r.data.requests || []);
    const m = {};
    (r.data.requests || []).forEach((q) => { m[q.email] = new Set(q.allowed_tabs || []); });
    setSel(m);
  }, []);

  React.useEffect(() => { if (open) { setEditing(null); load(); } }, [open, load]);
  if (!open) return null;

  const toggle = (email, key) => setSel((prev) => {
    const s = new Set(prev[email] || []);
    if (s.has(key)) s.delete(key); else s.add(key);
    return { ...prev, [email]: s };
  });
  const allTabs = (email) => setSel((prev) => ({ ...prev, [email]: new Set(tabs.map((t) => t.key)) }));
  const noTabs = (email) => setSel((prev) => ({ ...prev, [email]: new Set() }));

  const decide = async (email, status) => {
    setBusy(email + status);
    const chosen = Array.from(sel[email] || []);
    const r = await safeCall(() => api.post("/access/approve", { email, tabs: chosen, status }));
    setBusy("");
    if (!r.ok || r.data?.ok === false) return toast.error(r.data?.error || r.error || "Failed");
    toast.success(status === "approved" ? ("Approved " + email) : ("Denied " + email));
    setEditing(null); load(); onChanged && onChanged();
  };

  const pending = reqs.filter((q) => q.status !== "approved");
  const approved = reqs.filter((q) => q.status === "approved");
  const labelOf = (k) => (tabs.find((t) => t.key === k) || {}).label || k;

  const Checklist = ({ email, onDone, doneLabel }) => (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Select the tabs this user can see</span>
        <div className="flex items-center gap-2">
          <button onClick={() => allTabs(email)} className="text-[11px] text-primary hover:underline">All</button>
          <button onClick={() => noTabs(email)} className="text-[11px] text-muted-foreground hover:underline">None</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
        {tabs.map((t) => {
          const on = (sel[email] || new Set()).has(t.key);
          return (
            <button key={t.key} onClick={() => toggle(email, t.key)} className={"flex items-center gap-2 text-xs rounded-md border px-2 py-1.5 text-left " + (on ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/70 hover:bg-secondary")}>
              <span className={"h-3.5 w-3.5 rounded border grid place-items-center shrink-0 " + (on ? "bg-primary border-primary text-primary-foreground" : "border-border")}>{on && <Check className="h-2.5 w-2.5" />}</span>
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onDone} disabled={busy !== ""} data-testid={"done-" + email}>
          {busy === email + "approved" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {doneLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy !== ""}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-6 overflow-y-auto" data-testid="access-modal">
      <div className="bg-card border border-border rounded-lg w-full max-w-3xl my-6 shadow-xl">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">Access management</span>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-5 max-h-[72vh] overflow-y-auto">
          {loading ? (
            <div className="py-10 grid place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Requests ({pending.length})</div>
                <div className="space-y-2">
                  {!pending.length && <p className="text-sm text-muted-foreground">No pending requests.</p>}
                  {pending.map((q) => (
                    <div key={q.email} className="border border-border rounded-md p-3">
                      <div className="flex items-center gap-2">
                        <div className="leading-tight">
                          <div className="text-sm font-medium">{q.name || q.email}</div>
                          <div className="text-[11px] mono text-muted-foreground">{q.email}</div>
                        </div>
                        <span className={"ml-2 text-[10px] px-2 py-0.5 rounded-full " + (q.status === "denied" ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600")}>{q.status}</span>
                        <div className="ml-auto flex items-center gap-2">
                          {editing !== q.email && <Button size="sm" onClick={() => { setEditing(q.email); }} data-testid={"approve-" + q.email}><Check className="h-3.5 w-3.5" /> Approve</Button>}
                          {editing !== q.email && <Button size="sm" variant="outline" onClick={() => decide(q.email, "denied")} disabled={busy !== ""}>Deny</Button>}
                        </div>
                      </div>
                      {editing === q.email && <Checklist email={q.email} doneLabel="Done (approve)" onDone={() => decide(q.email, "approved")} />}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Approved ({approved.length})</div>
                <div className="space-y-2">
                  {!approved.length && <p className="text-sm text-muted-foreground">No one approved yet.</p>}
                  {approved.map((q) => (
                    <div key={q.email} className="border border-border rounded-md p-3">
                      <div className="flex items-center gap-2">
                        <div className="leading-tight">
                          <div className="text-sm font-medium">{q.name || q.email}</div>
                          <div className="text-[11px] mono text-muted-foreground">{q.email}</div>
                        </div>
                        <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">approved</span>
                        <div className="ml-auto flex items-center gap-2">
                          {editing !== q.email && <Button size="sm" variant="outline" onClick={() => setEditing(q.email)} data-testid={"edit-" + q.email}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}
                        </div>
                      </div>
                      {editing !== q.email && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(q.allowed_tabs || []).length === 0 && <span className="text-[11px] text-muted-foreground">no tabs</span>}
                          {(q.allowed_tabs || []).map((k) => <span key={k} className="text-[10px] bg-secondary rounded px-2 py-0.5">{labelOf(k)}</span>)}
                          {q.approved_by && <span className="text-[10px] text-muted-foreground ml-1">by {q.approved_by}</span>}
                        </div>
                      )}
                      {editing === q.email && <Checklist email={q.email} doneLabel="Save changes" onDone={() => decide(q.email, "approved")} />}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
