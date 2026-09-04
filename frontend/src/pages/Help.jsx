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
  { id: "access", title: "Access management (admin)", what: "Admins control who can use the tool and which tabs each person sees.", steps: [
    "The Requests section lists pending users. Click Approve on the right.",
    "In the popup, select the tabs for that user (with All / None shortcuts) and click Done.",
    "The Approved section keeps the history (who got what, and who granted it). Use Edit to change a user's tabs.",
    "Use the search box to find a user by name or email.",
  ], note: "Only the three admins can see this. Access is enforced in both the UI and the backend." },
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
