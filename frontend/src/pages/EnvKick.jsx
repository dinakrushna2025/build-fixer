import EnvActionPanel from "@/components/EnvActionPanel";
import { Zap } from "lucide-react";
export default function EnvKick() {
  return (
    <EnvActionPanel
      title="Kick (supervisord)"
      subtitle="Pod up but hung or zombie. Restarts processes inside via envcore. Needs env_key (slug)."
      path="/env/kick"
      needsEnvKey
      buildBody={(job, envKey) => ({ env_key: envKey || undefined })}
      okMsg="Kick sent, supervisord restarting"
      buttonLabel="Kick"
      Icon={Zap}
    />
  );
}
