import React from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, LogOut, User as UserIcon, HelpCircle } from "lucide-react";

export default function TopBar() {
  const { dark, setDark } = useApp();
  const { user, logout } = useAuth();

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
      className="h-14 shrink-0 border-b border-border bg-background flex items-center px-6"
    >
      <div className="flex items-center gap-2 ml-auto">
        <Link
          to="/help"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="help-link"
          title="Help & Docs (opens in new tab)"
          className="h-9 w-9 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
        >
          <HelpCircle className="h-4 w-4" />
        </Link>
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
