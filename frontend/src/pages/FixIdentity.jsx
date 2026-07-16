import React from "react";
import { useApp } from "@/context/AppContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ResponseDrawer from "@/components/ResponseDrawer";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusChip from "@/components/StatusChip";
import { safeCall, api } from "@/api";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Apple, Smartphone } from "lucide-react";

export default function FixIdentity() {
  const { jobId, operator } = useApp();
  const [job, setJob] = React.useState(jobId);
  React.useEffect(() => setJob(jobId), [jobId]);

  // iOS state
  const [iosApp, setIosApp] = React.useState("");
  const [bundleId, setBundleId] = React.useState("");
  const [iosOpen, setIosOpen] = React.useState(false);
  const [iosLoading, setIosLoading] = React.useState(false);
  const [iosResp, setIosResp] = React.useState(null);

  // Android state
  const [andApp, setAndApp] = React.useState("");
  const [pkg, setPkg] = React.useState("");
  const [andOpen, setAndOpen] = React.useState(false);
  const [andLoading, setAndLoading] = React.useState(false);
  const [andResp, setAndResp] = React.useState(null);

  const doIos = async () => {
    setIosLoading(true);
    const body = { job_id: job, operator };
    if (iosApp) body.app_name = iosApp;
    if (bundleId) body.bundle_id = bundleId;
    const r = await safeCall(() => api.post("/identity/ios", body));
    setIosLoading(false);
    setIosOpen(false);
    setIosResp(r);
    if (r.ok && r.data?.status_code === 200) toast.success("iOS identity updated");
    else toast.error(r.error || `HTTP ${r.data?.status_code}`);
  };

  const doAndroid = async () => {
    setAndLoading(true);
    const body = { job_id: job, operator };
    if (andApp) body.app_name = andApp;
    if (pkg) body.package_name = pkg;
    const r = await safeCall(() => api.post("/identity/android", body));
    setAndLoading(false);
    setAndOpen(false);
    setAndResp(r);
    if (r.ok && r.data?.status_code === 200) toast.success("Android identity updated");
    else toast.error(r.error || `HTTP ${r.data?.status_code}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fix App Identity"
        subtitle="Rewrite bundle_id / package_name / app_name on an existing config row. Hits the internal deployer endpoints with X-Internal-User: true."
        badge={<StatusChip severity="red">destructive</StatusChip>}
      />

      <Card>
        <CardContent className="p-4">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            job_id
          </label>
          <Input
            data-testid="identity-job-input"
            value={job}
            onChange={(e) => setJob(e.target.value)}
            className="mono mt-1.5 max-w-xl"
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="ios">
        <TabsList>
          <TabsTrigger value="ios" data-testid="tab-ios">
            <Apple className="h-4 w-4 mr-1.5" /> iOS
          </TabsTrigger>
          <TabsTrigger value="android" data-testid="tab-android">
            <Smartphone className="h-4 w-4 mr-1.5" /> Android
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ios">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                POST /api/v1/ios/internal/jobs/{"{JOB_ID}"}/identity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="app_name (optional)" testId="ios-app-name">
                  <Input
                    data-testid="ios-app-name-input"
                    value={iosApp}
                    onChange={(e) => setIosApp(e.target.value)}
                  />
                </Field>
                <Field label="bundle_id (optional)" testId="ios-bundle-id">
                  <Input
                    data-testid="ios-bundle-id-input"
                    value={bundleId}
                    onChange={(e) => setBundleId(e.target.value)}
                    placeholder="com.example.app"
                    className="mono"
                  />
                </Field>
              </div>
              <div className="text-xs text-muted-foreground">
                Only changed fields are sent. At least one required.
              </div>
              <Button
                variant="destructive"
                disabled={!job || (!iosApp && !bundleId)}
                onClick={() => setIosOpen(true)}
                data-testid="ios-submit"
              >
                <ShieldCheck className="h-4 w-4" /> Update iOS identity
              </Button>
              {iosResp && (
                <ResponseDrawer
                  title="Response"
                  status={iosResp.data?.status_code}
                  data={iosResp.data}
                  error={iosResp.error}
                  defaultOpen
                  testId="ios-response"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="android">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                POST /api/v1/android/internal/jobs/{"{JOB_ID}"}/identity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="app_name (optional)" testId="and-app-name">
                  <Input
                    data-testid="and-app-name-input"
                    value={andApp}
                    onChange={(e) => setAndApp(e.target.value)}
                  />
                </Field>
                <Field label="package_name (optional)" testId="and-pkg">
                  <Input
                    data-testid="and-pkg-input"
                    value={pkg}
                    onChange={(e) => setPkg(e.target.value)}
                    placeholder="com.example.app"
                    className="mono"
                  />
                </Field>
              </div>
              <div className="text-xs text-muted-foreground">
                Only changed fields are sent. At least one required.
              </div>
              <Button
                variant="destructive"
                disabled={!job || (!andApp && !pkg)}
                onClick={() => setAndOpen(true)}
                data-testid="and-submit"
              >
                <ShieldCheck className="h-4 w-4" /> Update Android identity
              </Button>
              {andResp && (
                <ResponseDrawer
                  title="Response"
                  status={andResp.data?.status_code}
                  data={andResp.data}
                  error={andResp.error}
                  defaultOpen
                  testId="and-response"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={iosOpen}
        onOpenChange={setIosOpen}
        title="Rewrite iOS identity"
        description={`This will POST to the internal iOS identity endpoint for job ${job}. This modifies the customer's build config.`}
        confirmValue={job}
        confirmLabel="Update iOS identity"
        onConfirm={doIos}
        loading={iosLoading}
        testId="ios-confirm"
      />
      <ConfirmDialog
        open={andOpen}
        onOpenChange={setAndOpen}
        title="Rewrite Android identity"
        description={`This will POST to the internal Android identity endpoint for job ${job}. This modifies the customer's build config.`}
        confirmValue={job}
        confirmLabel="Update Android identity"
        onConfirm={doAndroid}
        loading={andLoading}
        testId="and-confirm"
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
