import React from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Sun, Moon, LogOut, User as UserIcon } from "lucide-react";

export default function TopBar() {
  const { jobId, setJobId, dark, setDark } = useApp();
  const { user, logout } = useAuth();
  const [local, setLocal] = React.useState(jobId);

  React.useEffect(() => setLocal(jobId), [jobId]);

  const submit = (e) => {
    e.preventDefault();
    setJobId((local || "").trim());
  };

  const initials = React.useMemo(() => {
    const src = user?.name || user?.email || "?";
    return src
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("");
  }, [user]);

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

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="user-menu-trigger"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary transition-colors"
              >
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt=""
                    className="h-7 w-7 rounded-full border border-border"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-medium">
                    {initials || <UserIcon className="h-3.5 w-3.5" />}
                  </div>
                )}
                <span
                  data-testid="user-email"
                  className="mono text-xs text-muted-foreground max-w-[180px] truncate"
                >
                  {user.email}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="text-sm leading-tight">{user.name || user.email}</div>
                <div className="mono text-[11px] text-muted-foreground truncate">
                  {user.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="logout-btn"
                onClick={logout}
                className="text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
