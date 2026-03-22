"use client";

/**
 * Sidebar.tsx — Persistent left navigation sidebar shown on every page.
 *
 * Contains the app logo/title at the top and nav links to each page.
 * Highlights the currently active page based on the URL path.
 *
 * Depends on: next/navigation (usePathname), next/link, lucide-react icons
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderSync, LayoutDashboard, FolderTree, Columns2, Terminal, FolderInput, Zap, PlusCircle } from "lucide-react";

// Each nav item: where it goes, what label to show, and which icon to use
const NAV_ITEMS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/auto-create", label: "Auto-Creator", icon: Zap },
  { href: "/folder-mover", label: "Folder Mover", icon: FolderInput },
  { href: "/hierarchy", label: "Folder Hierarchy", icon: FolderTree },
  { href: "/board-columns", label: "Board Columns", icon: Columns2 },
  { href: "/board-setup", label: "Board Setup", icon: PlusCircle },
  { href: "/debugger", label: "Debugger", icon: Terminal },
];


export default function Sidebar() {
  // Get the current URL path so we can highlight the active link
  const pathname = usePathname();

  return (
    <aside className="w-52 shrink-0 h-screen sticky top-0 border-r border-border/60 bg-card flex flex-col">

      {/* App logo and title at the top */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border/60">
        <FolderSync className="h-5 w-5 text-primary shrink-0" />
        <span className="font-semibold text-sm tracking-tight leading-tight">
          Dropbox<br />Automation
        </span>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          // A link is "active" if the pathname exactly matches (or starts with for nested routes)
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
