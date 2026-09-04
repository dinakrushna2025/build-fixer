import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusChip from "@/components/StatusChip";
import ConfirmDialog from "@/components/ConfirmDialog";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Plug, Database, Folder, RefreshCw, Trash2, Plus, Search, X, Copy, Pencil, Check, Zap, Hexagon, Upload, Download, Shield, Eye, EyeOff, ArrowRight, AppWindow, Server, LogOut } from "lucide-react";

function displayValue(v) {
  if (v === null || v === undefined) return { text: "null", cls: "text-muted-foreground italic" };
  if (typeof v === "boolean") return { text: String(v), cls: "text-blue-500" };
  if (typeof v === "number") return { text: String(v), cls: "text-amber-500" };
  if (typeof v === "string") return { text: v, cls: "text-emerald-500" };
  if (typeof v === "object") {
    if (v.$oid) return { text: v.$oid, cls: "text-violet-500", raw: true };
    if (v.$date) return { text: (typeof v.$date === "object" ? String(v.$date.$numberLong || "") : String(v.$date)), cls: "text-sky-500", raw: true };
    return { text: JSON.stringify(v), cls: "text-foreground", raw: true };
  }
  return { text: String(v), cls: "text-foreground" };
}

function idText(d) {
  const id = d && d._id;
  if (id && typeof id === "object" && id.$oid) return id.$oid;
  return typeof id === "string" ? id : JSON.stringify(id);
}

function DocCard({ doc, side, onDelete, onEditField }) {
  const [open, setOpen] = React.useState(true);
  const [editKey, setEditKey] = React.useState(null);
  const [editVal, setEditVal] = React.useState("");
  const entries = Object.entries(doc).filter(([k]) => k !== "_id");
  const idt = idText(doc);
  const accent = side === "preview" ? "border-l-violet-400" : "border-l-emerald-400";

  const startEdit = (k, v) => {
    const dv = displayValue(v);
    setEditKey(k); setEditVal(dv.raw ? dv.text : (v === null ? "" : String(v)));
  };
  const commit = (k) => { onEditField(doc, k, editVal); setEditKey(null); };

  return (
    <div className={"border border-border border-l-2 " + accent + " rounded-md p-3 space-y-2"}>
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground">
          <span className={"inline-block transition-transform " + (open ? "rotate-90" : "")}>&#9656;</span>
        </button>
        <code className="text-[11px] bg-secondary px-2 py-1 rounded truncate max-w-[220px]" title={idt}>{idt}</code>
        <button onClick={() => { navigator.clipboard?.writeText(idt); toast.success("_id copied"); }} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
        <button onClick={() => onDelete(doc)} className="text-red-500 hover:text-red-600 ml-auto"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {open && (
        <div className="space-y-1 pl-1">
          {entries.map(([k, v]) => {
            const dv = displayValue(v);
            const editable = v === null || ["string", "number", "boolean"].includes(typeof v);
            return (
              <div key={k} className="flex items-start gap-2 text-[12px] mono group">
                <span className="text-muted-foreground shrink-0">{k}:</span>
                {editKey === k ? (
                  <span className="flex items-center gap-1 flex-1">
                    <input value={editVal} onChange={(e) => setEditVal(e.target.value)} className="flex-1 bg-background border border-border rounded px-1 py-0.5 text-[12px] mono" autoFocus />
                    <button onClick={() => commit(k)} className="text-emerald-500"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditKey(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 min-w-0">
                    <span className={dv.cls + " break-all"}>{dv.text}</span>
                    {editable && <button onClick={() => startEdit(k, v)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0"><Pencil className="h-3 w-3" /></button>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DbManager() {
  const { jobId, operator } = useApp();
  const [slug, setSlug] = React.useState(jobId || "");
  const [prodUrl, setProdUrl] = React.useState("");
  const [view, setView] = React.useState("split");
  const [conn, setConn] = React.useState(null);
  const [prevDbs, setPrevDbs] = React.useState([]);
  const [prodDbs, setProdDbs] = React.useState([]);
  const [prevDb, setPrevDb] = React.useState("");
  const [prodDb, setProdDb] = React.useState("");
  const [prevCols, setPrevCols] = React.useState([]);
  const [prodCols, setProdCols] = React.useState([]);
  const [coll, setColl] = React.useState("");
  const [prevDocs, setPrevDocs] = React.useState([]);
  const [prodDocs, setProdDocs] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const [delTarget, setDelTarget] = React.useState(null);
  const [insertSide, setInsertSide] = React.useState(null);
  const [insertJson, setInsertJson] = React.useState("{}");
  const [importSide, setImportSide] = React.useState(null);
  const [importText, setImportText] = React.useState("");
  const [showUrl, setShowUrl] = React.useState(false);
  const [prevPage, setPrevPage] = React.useState(1);
  const [prevPages, setPrevPages] = React.useState(1);
  const [prevTotal, setPrevTotal] = React.useState(0);
  const [prodPage, setProdPage] = React.useState(1);
  const [prodPages, setProdPages] = React.useState(1);
  const [prodTotal, setProdTotal] = React.useState(0);

  const call = (path, extra) => safeCall(() => api.post(path, { slug: slug.trim(), prod_url: prodUrl.trim() || null, operator, ...extra }));

  const connect = async () => {
    if (!slug.trim()) return toast.error("preview slug required");
    setBusy("connect");
    setPrevDbs([]); setProdDbs([]); setPrevDb(""); setProdDb(""); setPrevCols([]); setProdCols([]); setColl(""); setPrevDocs([]); setProdDocs([]);
    const r = await call("/dbmgr/connect", {});
    setBusy("");
    setConn(r.data || { ok: false });
    if (!r.data?.ok) return toast.error("Connect failed");
    toast.success("Connected");
    const pv = r.data?.preview?.databases || [];
    const pr = r.data?.production?.databases || [];
    setPrevDbs(pv); setProdDbs(pr);
    if (pv[0]) selectPrevDb(pv[0].name);
    if (pr[0]) selectProdDb(pr[0].name);
  };

  const selectPrevDb = async (name) => {
    setPrevDb(name); setPrevCols([]);
    const r = await call("/dbmgr/collections", { target: "preview", db: name });
    if (r.data?.collections) setPrevCols(r.data.collections);
  };
  const selectProdDb = async (name) => {
    setProdDb(name); setProdCols([]);
    const r = await call("/dbmgr/collections", { target: "production", db: name });
    if (r.data?.collections) setProdCols(r.data.collections);
  };

  const mergedCols = React.useMemo(() => {
    const m = {};
    prevCols.forEach((c) => { m[c.name] = { name: c.name, prev: c.count, prod: null }; });
    prodCols.forEach((c) => { m[c.name] = { ...(m[c.name] || { name: c.name, prev: null }), prod: c.count }; });
    return Object.values(m).sort((a, b) => a.name.localeCompare(b.name));
  }, [prevCols, prodCols]);

  const applyDocs = (side, d, pg) => {
    if (side === "preview") { setPrevDocs(d.documents || []); setPrevPage(d.current_page || pg); setPrevPages(d.total_pages || 1); setPrevTotal(d.total || 0); }
    else { setProdDocs(d.documents || []); setProdPage(d.current_page || pg); setProdPages(d.total_pages || 1); setProdTotal(d.total || 0); }
  };

  const loadSide = async (side, pg) => {
    const db = side === "preview" ? prevDb : prodDb;
    if (!db || !coll) return;
    const r = await call("/dbmgr/documents", { target: side, db, coll, page: pg, limit: 50, filter: filter.trim() || null });
    applyDocs(side, r.data || {}, pg);
  };

  const openColl = async (name) => {
    setColl(name); setBusy("docs"); setPrevDocs([]); setProdDocs([]);
    const jobs = [];
    if (view !== "production" && prevDb) jobs.push(call("/dbmgr/documents", { target: "preview", db: prevDb, coll: name, page: 1, limit: 50, filter: filter.trim() || null }).then((r) => applyDocs("preview", r.data || {}, 1)));
    if (view !== "preview" && prodDb) jobs.push(call("/dbmgr/documents", { target: "production", db: prodDb, coll: name, page: 1, limit: 50, filter: filter.trim() || null }).then((r) => applyDocs("production", r.data || {}, 1)));
    await Promise.all(jobs);
    setBusy("");
  };

  const refreshDocs = () => { if (coll) openColl(coll); };

  const editField = async (side, doc, key, val) => {
    const db = side === "preview" ? prevDb : prodDb;
    let coerced = val;
    if (val === "true") coerced = true; else if (val === "false") coerced = false;
    else if (val !== "" && !isNaN(Number(val)) && String(Number(val)) === val) coerced = Number(val);
    const changes = [{ op: "edit", db, collection: coll, docId: doc._id, field: key, value: coerced }];
    const r = await call("/dbmgr/apply", { target: side, changes });
    if (r.data?.ok) { toast.success("Updated"); refreshDocs(); }
    else toast.error(r.data?.error || "Update failed");
  };

  const doDelete = async () => {
    const t = delTarget; setDelTarget(null);
    if (!t) return;
    const db = t.side === "preview" ? prevDb : prodDb;
    setBusy("apply");
    const changes = [{ op: "delete", db, collection: coll, docId: t.doc._id }];
    const r = await call("/dbmgr/apply", { target: t.side, changes });
    setBusy("");
    if (r.data?.ok) { toast.success("Deleted"); refreshDocs(); }
    else toast.error(r.data?.error || "Delete failed");
  };

  const doInsert = async () => {
    const side = insertSide; setInsertSide(null);
    let parsed;
    try { parsed = JSON.parse(insertJson); } catch (e) { return toast.error("Invalid JSON"); }
    const db = side === "preview" ? prevDb : prodDb;
    setBusy("apply");
    const changes = [{ op: "insert", db, collection: coll, document: parsed }];
    const r = await call("/dbmgr/apply", { target: side, changes });
    setBusy("");
    if (r.data?.ok) { toast.success("Inserted"); refreshDocs(); }
    else toast.error(r.data?.error || "Insert failed");
  };

  const doImport = async (side) => {
    let arr;
    try { arr = JSON.parse(importText); } catch (e) { return toast.error("Invalid JSON"); }
    if (!Array.isArray(arr)) arr = [arr];
    if (!arr.length) return toast.error("No documents in file");
    const db = side === "preview" ? prevDb : prodDb;
    setBusy("apply");
    const r = await call("/dbmgr/import", { target: side, db, coll, documents: arr });
    setBusy("");
    if (!r.data?.ok) { toast.error(r.data?.error || r.error || "Import failed"); return; }
    toast.success("Imported " + (r.data.inserted || 0) + " new, skipped " + (r.data.skipped || 0) + " existing" + (r.data.failed ? (", " + r.data.failed + " failed") : ""));
    setImportSide(null); setImportText(""); refreshDocs();
  };

  const doDump = async (side, fullDb) => {
    if (busy === "dump") return;
    const dbn = side === "preview" ? prevDb : prodDb;
    if (!dbn) return toast.error("pick a database first");
    setBusy("dump");
    const useColl = fullDb ? null : (coll || null);
    const r = await call("/dbmgr/dump", { target: side, db: dbn, coll: useColl });
    setBusy("");
    if (!r.data?.ok) return toast.error(r.data?.error || "Dump failed");
    let blob, fname;
    if (useColl) {
      blob = new Blob([JSON.stringify(r.data.documents, null, 2)], { type: "application/json" });
      fname = slug + "-" + side + "-" + dbn + "-" + useColl + ".json";
    } else {
      const bin = atob(r.data.zip_b64 || "");
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      blob = new Blob([arr], { type: "application/zip" });
      fname = slug + "-" + side + "-" + dbn + "-fulldb.zip";
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Dumped " + (r.data.count || 0) + " docs");
  };

  const Panel = ({ side, db, docs }) => {
    const isProd = side === "production";
    const page = isProd ? prodPage : prevPage;
    const pages = isProd ? prodPages : prevPages;
    const total = isProd ? prodTotal : prevTotal;
    return (
      <div className="flex-1 min-w-0">
        <div className={"flex items-center gap-2 px-3 py-2 rounded-t-md " + (isProd ? "bg-emerald-500/10" : "bg-violet-500/10")}>
          {isProd ? <Hexagon className="h-4 w-4 text-emerald-500" /> : <Zap className="h-4 w-4 text-violet-500" />}
          <span className={"text-sm font-medium " + (isProd ? "text-emerald-600" : "text-violet-600")}>{isProd ? "Production" : "Preview"}</span>
          <span className="text-[11px] mono bg-secondary px-2 py-0.5 rounded truncate max-w-[180px]">{db || "no db"}</span>
          <span className="text-[11px] mono text-muted-foreground truncate">{coll}</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{total}</span>
            <button onClick={refreshDocs} className="text-muted-foreground hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /></button>
            <button onClick={() => { setInsertJson("{}"); setInsertSide(side); }} className="text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
            <button onClick={() => { setImportText(""); setImportSide(side); }} className="text-muted-foreground hover:text-foreground" title="Bulk import JSON"><Upload className="h-3.5 w-3.5" /></button>
            <button onClick={() => doDump(side)} disabled={busy==="dump"} className="text-muted-foreground hover:text-foreground disabled:opacity-50" title={coll ? "Dump this collection" : "Dump whole database"}>{busy === "dump" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}</button>
          </div>
        </div>
        <div className="space-y-2 p-2 max-h-[62vh] overflow-y-auto border border-border rounded-b-md">
          {insertSide === side && (
            <div className="border border-border rounded-md p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Insert into {isProd ? "PRODUCTION" : "preview"}</span>
                <button onClick={() => setInsertSide(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
              <textarea value={insertJson} onChange={(e) => setInsertJson(e.target.value)} className="w-full h-28 mono text-xs border border-border rounded-md p-2 bg-background" data-testid="dbmgr-insert-json" />
              <Button size="sm" variant={isProd ? "destructive" : "default"} onClick={doInsert} disabled={busy === "apply"} data-testid="dbmgr-insert-btn">
                {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Insert
              </Button>
            </div>
          )}
          {importSide === side && (
            <div className="border border-border rounded-md p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Bulk import into {isProd ? "PRODUCTION" : "preview"} {coll}</span>
                <button onClick={() => setImportSide(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
              <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const rd = new FileReader(); rd.onload = () => setImportText(String(rd.result || "")); rd.readAsText(f); } }} className="text-xs" data-testid="dbmgr-import-file" />
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='paste JSON array [ {...}, {...} ]' className="w-full h-28 mono text-xs border border-border rounded-md p-2 bg-background" data-testid="dbmgr-import-json" />
              <Button size="sm" variant={isProd ? "destructive" : "default"} onClick={() => doImport(side)} disabled={busy === "apply" || !importText.trim()} data-testid="dbmgr-import-btn">
                {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Import all
              </Button>
            </div>
          )}
          {busy === "docs" ? (
            <div className="py-10 grid place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : docs.length ? docs.map((d, i) => (
            <DocCard key={i} doc={d} side={side} onDelete={(doc) => setDelTarget({ doc, side })} onEditField={(doc, k, v) => editField(side, doc, k, v)} />
          )) : <p className="text-sm text-muted-foreground py-8 text-center">No documents</p>}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 text-xs pt-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => loadSide(side, page - 1)}>Prev</Button>
            <span className="text-muted-foreground">Page {page} of {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => loadSide(side, page + 1)}>Next</Button>
          </div>
        )}
      </div>
    );
  };

  const prev = conn?.preview;
  const prod = conn?.production;

  const filled = slug.trim() && prodUrl.trim();

  if (!conn?.ok) {
    return (
      <div className="max-w-lg mx-auto pt-6 pb-16">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-violet-100 grid place-items-center mb-4"><Database className="h-8 w-8 text-violet-600" /></div>
          <h1 className="text-3xl font-semibold tracking-tight">Mongo Manager</h1>
          <p className="text-muted-foreground mt-2">Connect to your databases to get started</p>
        </div>
        <Card><CardContent className="p-6 space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium"><Zap className="h-4 w-4 text-violet-500" /> Preview App Name</span>
              <span className="text-[11px] text-violet-600 border border-violet-300 rounded-full px-2 py-0.5">Required</span>
            </div>
            <div className="relative">
              <AppWindow className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} onKeyDown={(e) => e.key === "Enter" && filled && connect()} placeholder="my-app-name" className="mono pl-9" data-testid="dbmgr-slug" />
            </div>
            <p className="text-xs text-muted-foreground">Your Emergent app name</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4 text-emerald-500" /> Production MongoDB URL</span>
              <span className="text-[11px] text-emerald-600 border border-emerald-300 rounded-full px-2 py-0.5">Required</span>
            </div>
            <div className="relative">
              <Server className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input type={showUrl ? "text" : "password"} value={prodUrl} onChange={(e) => setProdUrl(e.target.value)} placeholder="mongodb+srv://user:pass@cluster.mongodb.ne" className="mono pl-9 pr-9" data-testid="dbmgr-produrl" />
              <button type="button" onClick={() => setShowUrl(!showUrl)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showUrl ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            <p className="text-xs text-muted-foreground">Your deployed/production MongoDB connection string</p>
          </div>
          <Button onClick={connect} disabled={busy === "connect" || !filled} className="w-full" data-testid="dbmgr-connect">
            {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Connect <ArrowRight className="h-4 w-4" />
          </Button>
          {conn && !conn.ok && <p className="text-xs text-red-500 text-center">{typeof conn.error === "string" ? conn.error : "Connect failed"}</p>}
        </CardContent></Card>
        <p className="text-xs text-muted-foreground text-center mt-4">Your connection details are stored locally in your browser session and never shared.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-violet-100 grid place-items-center"><Database className="h-4 w-4 text-violet-600" /></div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Mongo Manager</div>
            <div className="text-[11px] mono text-muted-foreground">{slug}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-secondary p-0.5 ml-2">
          {["preview", "production", "split"].map((v) => (
            <button key={v} onClick={() => setView(v)} className={"px-3 py-1 text-xs rounded capitalize " + (view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")} data-testid={"dbmgr-view-" + v}>{v}</button>
          ))}
        </div>
        <div className="text-[11px] mono text-muted-foreground ml-auto flex gap-3">
          <span className="text-violet-500">preview: {prev?.connected ? prev.database_count + " dbs" : "error"}</span>
          <span className="text-emerald-500">production: {prod ? (prod.connected ? prod.database_count + " dbs" : "error") : "n/a"}</span>
        </div>
        <button onClick={() => setConn(null)} className="text-muted-foreground hover:text-foreground" title="Disconnect" data-testid="dbmgr-change"><LogOut className="h-4 w-4" /></button>
      </div>
      {prod && !prod.connected && <p className="text-[11px] text-red-500 mono">production: {prod.error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
          <Card><CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Split Navigator</span>
              <button onClick={connect} className="text-muted-foreground hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /></button>
            </div>
            {(view === "preview" || view === "split") && (
              <div>
                <label className="text-[11px] text-violet-500 flex items-center gap-1"><Zap className="h-3 w-3" /> Preview Database</label>
                <select value={prevDb} onChange={(e) => selectPrevDb(e.target.value)} className="w-full mt-1 bg-background border border-border rounded-md px-2 py-1.5 text-sm mono" data-testid="dbmgr-prevdb">
                  {prevDbs.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
                <button onClick={() => doDump("preview", true)} disabled={busy==="dump"||!prevDb} className="mt-1.5 text-[11px] text-violet-500 hover:underline flex items-center gap-1" data-testid="dbmgr-dumpdb-preview"><Download className="h-3 w-3" /> Dump full DB</button>
              </div>
            )}
            {(view === "production" || view === "split") && (
              <div>
                <label className="text-[11px] text-emerald-500 flex items-center gap-1"><Hexagon className="h-3 w-3" /> Production Database</label>
                <select value={prodDb} onChange={(e) => selectProdDb(e.target.value)} className="w-full mt-1 bg-background border border-border rounded-md px-2 py-1.5 text-sm mono" data-testid="dbmgr-proddb">
                  {prodDbs.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
                <button onClick={() => doDump("production", true)} disabled={busy==="dump"||!prodDb} className="mt-1.5 text-[11px] text-emerald-500 hover:underline flex items-center gap-1" data-testid="dbmgr-dumpdb-prod"><Download className="h-3 w-3" /> Dump full DB</button>
              </div>
            )}
            <div className="pt-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Collections {mergedCols.length}</div>
              <div className="space-y-0.5 max-h-[52vh] overflow-y-auto">
                {mergedCols.map((c) => (
                  <button key={c.name} onClick={() => openColl(c.name)} className={"w-full text-left px-2 py-1.5 rounded text-sm " + (coll === c.name ? "bg-primary/10 text-primary" : "hover:bg-secondary")} data-testid={"dbmgr-coll-" + c.name}>
                    <div className="flex items-center gap-2"><Folder className="h-3.5 w-3.5 shrink-0" /><span className="truncate mono">{c.name}</span></div>
                    <div className="flex items-center gap-3 pl-5 text-[10px] mono">
                      <span className="text-violet-500 flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" />{c.prev == null ? "-" : c.prev}</span>
                      <span className="text-emerald-500 flex items-center gap-0.5"><Hexagon className="h-2.5 w-2.5" />{c.prod == null ? "-" : c.prod}</span>
                    </div>
                  </button>
                ))}
                {!mergedCols.length && <p className="text-xs text-muted-foreground px-2 py-3">No collections</p>}
              </div>
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.key === "Enter" && refreshDocs()} placeholder='search: id, text, or JSON {"status":"open"}' className="mono h-8 text-xs" data-testid="dbmgr-filter" />
              <Button size="sm" variant="outline" onClick={refreshDocs} disabled={!coll}>Apply</Button>
            </div>
            {coll ? (
              <div className="flex gap-3">
                {(view === "preview" || view === "split") && <Panel side="preview" db={prevDb} docs={prevDocs} />}
                {(view === "production" || view === "split") && <Panel side="production" db={prodDb} docs={prodDocs} />}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">Pick a collection from the navigator</p>
            )}
          </CardContent></Card>
        </div>

      <ConfirmDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}
        title={"Delete document from " + (delTarget?.side === "production" ? "PRODUCTION" : "preview")}
        description={"This deletes one document by _id from the " + (delTarget?.side || "") + " " + coll + " collection." + (delTarget?.side === "production" ? " This writes to PRODUCTION." : "")}
        confirmValue={delTarget?.side === "production" ? "DELETE" : undefined} confirmLabel="Delete" onConfirm={doDelete} loading={busy === "apply"} testId="dbmgr-del-confirm" />
    </div>
  );
}
