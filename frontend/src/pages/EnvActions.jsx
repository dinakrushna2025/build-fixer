import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponseDrawer from "@/components/ResponseDrawer";
import ConfirmDialog from "@/components/ConfirmDialog";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, Power, Zap, Pause, Cpu, Smartphone, Apple, RotateCw } from "lucide-react";

export default function EnvActions() {
  const { jobId, operator } = useApp();
  const [job, setJob] = React.useState(jobId);
  const [envKey, setEnvKey] = React.useState("");
  React.useEffect(() => setJob(jobId), [jobId]);

  const [resp, setResp] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const run = async (which, path, body, okMsg) => {
    setBusy(which);
    const r = await safeCall(() => api.post(path, { job_id: job, operator, ...body }));
    setBusy("");
    setResp(r);
    const sc = r.data?.status_code;
    if (r.ok && sc && sc < 400) toast.success(okMsg);
    else toast.error(r.data?.error || r.data?.body?.detail || r.error || `HTTP ${sc}`);
  };

  const needJob = () => {
    if (!job) { toast.error("job_id required"); return false; }
    return true;
  };

  const actions = {
    restart: () => needJob() && run("restart", "/env/restart", {}, "Restart queued — preview waking"),
    kick: () => {
      if (!envKey && !job) return toast.error("env_key (slug) required for KICK");
      run("kick", "/env/kick", { env_key: envKey || undefined }, "Kick sent — supervisord restarting");
    },
    pause: () => needJob() && run("pause", "/env/pause", {}, "Pause sent"),
    bump: () => needJob() && run("bump", "/env/bump", { machine_type: "large" }, "Machine bumped to large"),
    android: () => run("android", "/env/android-build", { build_type: "both" }, "Android build triggered"),
    ios: () => run("ios", "/env/ios-build", {}, "iOS build triggered"),
    hitl: () => run("hitl", "/env/hitl", {}, "HITL continue queued"),
  };

  const guarded = (key) => { setConfirm(""); actions[key](); };

  const Spin = ({ k, Icon }) =>
    busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Env Actions (L2)"
        subtitle="Recover a preview or trigger a build via agent-service, using the tool's own service token. No infra access needed. Every action is audit-logged."
      />

      <Card>
        <CardContent className="p-4 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">job_id</label>
            <Input data-testid="env-job-input" value={job}
              onChange={(e) => setJob(e.target.value)} className="mono mt-1.5" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              env_key / slug <span className="normal-case">(KICK only)</span>
            </label>
            <Input data-testid="env-key-input" value={envKey}
              onChange={(e) => setEnvKey(e.target.value)} className="mono mt-1.5"
              placeholder="app slug for KICK" />
          </div>
        </CardContent>
      </Card>

      <div className="text-xs uppercase tracking-wider text-muted-foreground">Recovery</div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card data-testid="env-restart-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2">
            <Power className="h-4 w-4 text-primary" /> Wake / Restart</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">Recreates the container. Asleep / empty IP / bad gateway / wedged tool server.</p>
            <Button onClick={actions.restart} disabled={busy === "restart" || !job} data-testid="env-restart-btn">
              <Spin k="restart" Icon={Power} /> Wake / Restart</Button>
          </CardContent>
        </Card>

        <Card data-testid="env-kick-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Kick (supervisord)</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">Pod up but hung/zombie. Restarts processes inside via envcore. Needs env_key (slug).</p>
            <Button variant="outline" onClick={actions.kick} disabled={busy === "kick" || (!envKey && !job)} data-testid="env-kick-btn">
              <Spin k="kick" Icon={Zap} /> Kick</Button>
          </CardContent>
        </Card>

        <Card data-testid="env-pause-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2">
            <Pause className="h-4 w-4 text-primary" /> Pause</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">Clear a stuck "running" state before Wake. Note: internal host is often broken (500).</p>
            <Button variant="outline" onClick={actions.pause} disabled={busy === "pause" || !job} data-testid="env-pause-btn">
              <Spin k="pause" Icon={Pause} /> Pause</Button>
          </CardContent>
        </Card>

        <Card data-testid="env-bump-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" /> Bump to large</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">Heavy / OOM job. Raises machine to large, then run Wake to apply.</p>
            <Button variant="outline" onClick={() => setConfirm("bump")} disabled={busy === "bump" || !job} data-testid="env-bump-btn">
              <Spin k="bump" Icon={Cpu} /> Bump to large</Button>
          </CardContent>
        </Card>
      </div>

      <div className="text-xs uppercase tracking-wider text-muted-foreground">Build / Agent</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card data-testid="env-android-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" /> Android rebuild</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">Fresh Android (EAS) build. Use after a keystore / config fix.</p>
            <Button variant="outline" onClick={() => setConfirm("android")} disabled={busy === "android" || !job} data-testid="env-android-btn">
              <Spin k="android" Icon={Smartphone} /> Trigger Android build</Button>
          </CardContent>
        </Card>

        <Card data-testid="env-ios-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2">
            <Apple className="h-4 w-4 text-primary" /> iOS rebuild</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">Fresh iOS (EAS) build. Use after a cert / identity fix.</p>
            <Button variant="outline" onClick={() => setConfirm("ios")} disabled={busy === "ios" || !job} data-testid="env-ios-btn">
              <Spin k="ios" Icon={Apple} /> Trigger iOS build</Button>
          </CardContent>
        </Card>

        <Card data-testid="env-hitl-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2">
            <RotateCw className="h-4 w-4 text-primary" /> HITL continue</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">Unstick a hung / paused agent. NOT for poisoned-trajectory wedges (those need a new chat).</p>
            <Button variant="outline" onClick={() => setConfirm("hitl")} disabled={busy === "hitl" || !job} data-testid="env-hitl-btn">
              <Spin k="hitl" Icon={RotateCw} /> HITL continue</Button>
          </CardContent>
        </Card>
      </div>

      {resp && (
        <ResponseDrawer title="agent-service response" status={resp.data?.status_code}
          data={resp.data} error={resp.error} defaultOpen testId="env-response" />
      )}

      <ConfirmDialog
        open={confirm === "bump"} onOpenChange={(o) => !o && setConfirm("")}
        title="Bump machine to large"
        description={`This raises the machine size to large for job ${job}, then run Wake to apply.`}
        confirmValue={job} confirmLabel="Bump to large" onConfirm={() => guarded("bump")} testId="env-bump-confirm" />
      <ConfirmDialog
        open={confirm === "android"} onOpenChange={(o) => !o && setConfirm("")}
        title="Trigger Android build"
        description={`This starts a fresh Android EAS build for job ${job}. It consumes build minutes.`}
        confirmValue={job} confirmLabel="Trigger Android build" onConfirm={() => guarded("android")} testId="env-android-confirm" />
      <ConfirmDialog
        open={confirm === "ios"} onOpenChange={(o) => !o && setConfirm("")}
        title="Trigger iOS build"
        description={`This starts a fresh iOS EAS build for job ${job}. It consumes build minutes.`}
        confirmValue={job} confirmLabel="Trigger iOS build" onConfirm={() => guarded("ios")} testId="env-ios-confirm" />
      <ConfirmDialog
        open={confirm === "hitl"} onOpenChange={(o) => !o && setConfirm("")}
        title="HITL continue"
        description={`This re-queues a continue for job ${job}. Do NOT use on poisoned-trajectory wedges (oversized image / 100K cap / cross-model signature).`}
        confirmValue={job} confirmLabel="HITL continue" onConfirm={() => guarded("hitl")} testId="env-hitl-confirm" />
    </div>
  );
}
