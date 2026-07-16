import React from "react";
import { useApp } from "@/context/AppContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sun, Moon, User } from "lucide-react";

export default function TopBar() {
  const { jobId, setJobId, operator, setOperator, dark, setDark } = useApp();
  const [local, setLocal] = React.useState(jobId);

  React.useEffect(() => setLocal(jobId), [jobId]);

  const submit = (e) => {
    e.preventDefault();
    setJobId((local || "").trim());
  };

  return (
    <header
      data-testid="topbar"
      className="h-14 shrink-0 border-b border-border bg-background flex items-center gap-3 px-6"
    >
      <form onSubmit={submit} className="flex items-center gap-2 flex-1 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="jobid-input"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Search job_id — Enter to load"
            className="pl-9 mono h-9 border-border"
          />
        </div>
        <Button data-testid="jobid-submit" type="submit" size="sm" className="h-9">
          Load
        </Button>
      </form>

      <div className="flex items-center gap-2 pl-6 border-l border-border">
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="operator-input"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="operator name (audit)"
            className="pl-9 h-9 w-52 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setDark(!dark)}
          data-testid="theme-toggle"
          aria-label="toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
