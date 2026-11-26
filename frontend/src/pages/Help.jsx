import React from "react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { Sun, Moon } from "lucide-react";

const SECTIONS = [
  { id: "start", title: "Getting started", what: "How to begin using the tool.", steps: [
    "Sign in with an @emergent.sh email only. On your first login an access request is sent to the admins.",
    "You only see the sidebar tabs an admin has granted you in Access management.",
    "Many tabs depend on a customer preview pod. If the pod is asleep, wake it first from the Wake / Restart tab.",
    "The toggle at the top of the sidebar collapses or expands it. The top-right corner has the theme switch and your profile (sign out).",
  ]},
  { id: "diagnose", title: "Diagnose", what: "Look up a job's iOS and Android build config and the real failure reason.", steps: [
    "Enter the job_id and click Run.",
    "You get the ground-truth iOS and Android config rows plus red-flag detection.",
    "Click Pull logs to fetch the real Cloud Build / EAS pipeline failure reason (and log lines) inline.",
  ], note: "This is where you find out why a build failed, from the actual pipeline logs, not just the DB row." },
  { id: "expo", title: "Find Account", what: "Look up an Expo account or SuprSend config.", steps: [
    "Use the toggle at the top to choose a mode: Expo Account or SuprSend.",
    "Enter the job or app details and run the lookup.",
  ]},
  { id: "identity", title: "Fix App Identity", what: "Fix a job's bundle_id or package_name.", steps: [
    "Enter the job_id, type the new bundle_id / package_name, and apply.",
  ], note: "This changes the app identity, so use it carefully." },
  { id: "keystore", title: "Keystore Manager", what: "Look up an Android keystore and download its .pem.", steps: [
    "Look up the keystore by job_id or package.",
    "Use Download .pem to get the keystore PEM (for the Play Store upload key).",
  ]},
  { id: "creds", title: "Creds & Retry (iOS)", what: "Inspect iOS credentials and force a build retry.", steps: [
    "Enter the job_id, review the iOS creds state, and trigger a force retry if needed.",
  ]},
  { id: "fingerprint", title: "Signing Fingerprint", what: "Get an app's SHA-1 / SHA-256 signing fingerprint.", steps: [
    "Enter the job_id and run the lookup.",
  ]},
  { id: "pem", title: "PEM / KMS Tools", what: "PEM and KMS related operations.", steps: [
    "Enter the job_id and choose the required PEM/KMS action.",
  ]},
  { id: "forkchain", title: "Fork Chain", what: "Trace a job's fork chain (parent / child).", steps: [
    "Enter the job_id. The chain of parent and child jobs is shown.",
  ], note: "Useful for understanding fork issues such as a deleted parent or a split production DB." },
  { id: "domain", title: "Domain Remove", what: "Check and remove a stale custom domain.", steps: [
    "Enter only the domain. No user id is needed, the owner is resolved automatically.",
    "Check shows the DNS records and the connected-in-our-system status.",
    "Remove deletes the stale domain, with a confirmation step.",
  ]},
  { id: "stripe", title: "Stripe Sandbox", what: "Check or unlink a job's Stripe sandbox.", steps: [
    "Enter the job_id and use Check sandbox to see the current state.",
    "Unlink sandbox removes the sandbox so the customer can connect Stripe fresh. A confirmation is required.",
  ], note: "The customer's own universal key is resolved automatically, so it stays per-user scoped." },
  { id: "env", title: "Wake / Restart, Kick, Bump, HITL", what: "L2 environment recovery actions.", steps: [
    "Wake / Restart: wake a sleeping preview pod or restart it.",
    "Kick: kick the environment to get it out of a stuck state.",
    "Bump to large: move the environment to a larger machine type.",
    "HITL continue: continue a human-in-the-loop step.",
    "For each action, enter the job_id (or env_key) and run.",
  ], note: "Wake / Restart is pre-authorized. The other actions run a per-job authorization check." },
  { id: "dbmgr", title: "DB Manager", what: "Browse and edit an app's preview and production databases side by side, like mongo-viewer-2.", steps: [
    "Enter the preview slug (e.g. deadline-notifier-16) and the deployed Mongo URL, then click Connect.",
    "Use the Preview / Production / Split toggle to choose the view. Split shows both side by side.",
    "Pick a database and collection from the left navigator. Each collection shows both preview and production counts.",
    "Documents appear as field-by-field cards. Use the pencil to edit a field, the trash icon to delete, and plus to insert a single document.",
    "The search box accepts an id, plain text, or a JSON filter. Collections with more than 50 documents get Prev / Next pagination.",
    "Import (upload icon): bulk import from a JSON file or paste. Documents whose _id already exists are skipped, only new ones are added, so no duplicates are created.",
    "Dump (download icon): export a single collection as .json, or use Dump full DB in the navigator to export the whole database as one .zip with a separate .json per collection.",
  ], note: "Production goes through the allowlisted mongo-viewer-2 backend. For preview, that app's preview pod must be awake." },
  { id: "export", title: "BSON Export", what: "Generate a downloadable BSON export (database dump) of an app without asking engineering.", steps: [
    "Enter the app slug and click Resolve to get its deployment id.",
    "Click Create export. The export job runs and its status updates inline.",
    "When the status is ready, use the download link to get the BSON archive.",
  ], note: "Safe for L1 and L2 to self serve. The export is read only, it never changes the app data." },
  { id: "domainfix", title: "Domain Fix / SSL", what: "Repair a custom domain that shows Deployment not found, and re run SSL and domain verification for the customer.", steps: [
    "Enter the domain or app and click Check status to see the Cloudflare hostname, SSL state and the appName metadata.",
    "Click Fix mapping to patch the hostname metadata to the right deployment name. It asks for confirmation first.",
    "To re run verification, fill the domain, the app it points at, and the Trinity ticket, then click Verify domain.",
  ], note: "ssl_pending means DNS is right and the certificate is still issuing. Check status again after about 30 seconds, do not ask the customer to change anything." },
  { id: "dns", title: "DNS Records", what: "Read and edit A, CNAME, TXT and MX records on a domain bought through Emergent, including repointing it to Render, Vercel or the customer's own server.", steps: [
    "Always click Read zone first, and again after every change, to see the real records.",
    "Add a record: pick the type, host and value. For @, *, www or an Emergent linked subdomain, tick allow hosting change. For an apex MX, tick allow apex MX.",
    "Delete a record: copy the exact stored value from the zone, then delete one record at a time.",
  ], note: "Only Emergent bought domains. A CNAME cannot share a host with another record. CNAME at the apex is refused. This never changes nameservers." },
  { id: "cachepurge", title: "Cache Purge", what: "Purge an app's crawler (SEO prerender) cache so the next crawl re renders every path.", steps: [
    "Enter the app name, app id, or custom domain and click Purge cache.",
    "Fix the upstream cause first (an edge challenge, WAF rule, or proxied DNS), or the next crawl re caches the same bad response.",
  ], note: "A status of purged or nothing_cached is clean. Any incomplete status means the cache was not fully seen, so do not report it as clear." },
  { id: "secrets", title: "Secrets Viewer", what: "Read only view of an app's deployed secret names and masked values.", steps: [
    "Enter the app name and click View secrets. It works even if the app was deleted.",
  ], note: "This tab can only read. Values come back masked and there is no way to change a secret from here." },
];

export default function Help() {
  const { dark, setDark } = useApp();
  return (
    <div className="space-y-5">
      <button
        onClick={() => setDark(!dark)}
        data-testid="help-theme-toggle"
        title="Toggle theme"
        aria-label="toggle theme"
        className="fixed top-4 right-4 z-40 h-9 w-9 grid place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <PageHeader title="Help & Docs" subtitle="What each tab does and how to use it. Section-wise steps are below." />

      <Card><CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Contents</div>
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={"#" + s.id} className="text-xs rounded-full border border-border px-3 py-1 text-foreground/70 hover:text-primary hover:border-primary">{s.title}</a>
          ))}
        </div>
      </CardContent></Card>

      {SECTIONS.map((s) => (
        <Card key={s.id} id={s.id}><CardContent className="p-4 space-y-2 scroll-mt-20">
          <div className="text-base font-semibold">{s.title}</div>
          <p className="text-sm text-muted-foreground">{s.what}</p>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            {s.steps.map((st, i) => <li key={i}>{st}</li>)}
          </ol>
          {s.note && <p className="text-[12px] text-amber-600 border-l-2 border-amber-400 pl-2">{s.note}</p>}
        </CardContent></Card>
      ))}
    </div>
  );
}
