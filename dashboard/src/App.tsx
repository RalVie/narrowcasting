import { useEffect, useState } from "react";
import {
  clearDashboardAdminKey,
  hasDashboardAdminKey,
  promptForDashboardAdminKey,
  subscribeDashboardAdminKeyChange
} from "./api/apiBase";
import { AssignmentsPage } from "./pages/AssignmentsPage";
import { AuditPage } from "./pages/AuditPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MediaLibraryPage } from "./pages/MediaLibraryPage";
import { ProgramsPage } from "./pages/ProgramsPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { SchedulePreviewPage } from "./pages/SchedulePreviewPage";
import { SchedulerDiagnosticsPage } from "./pages/SchedulerDiagnosticsPage";
import { SchedulerPage } from "./pages/SchedulerPage";
import { ScreensPage } from "./pages/ScreensPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SystemStatusPage } from "./pages/SystemStatusPage";
import { ThemesPage } from "./pages/ThemesPage";

type ComponentNavigationPage = {
  label: string;
  component: () => JSX.Element;
  id?: string;
};

type NavigationPage =
  | ComponentNavigationPage
  | {
      label: string;
      href: string;
    };

interface NavigationGroup {
  label: string;
  description: string;
  pages: NavigationPage[];
  collapsed?: boolean;
  accessory?: "admin-session";
}

const pageGroups = [
  {
    label: "🏠 Home",
    description: "Start with what needs attention.",
    pages: [{ label: "Dashboard", component: DashboardPage }]
  },
  {
    label: "Create",
    description: "Build reusable content.",
    pages: [
      { label: "Media Library", component: MediaLibraryPage },
      { label: "Playlists", component: PlaylistsPage },
      { label: "Programs", component: ProgramsPage },
      { label: "Themes", component: ThemesPage }
    ]
  },
  {
    label: "Publish",
    description: "Control what screens should display.",
    pages: [
      { label: "Campaigns", component: CampaignsPage },
      { label: "Schedule Preview", component: SchedulePreviewPage }
    ]
  },
  {
    label: "Operate",
    description: "Manage screens and monitor playback.",
    pages: [
      { label: "Screens", component: ScreensPage },
      { label: "Screen Groups", href: "#screens" },
      { label: "System Status", component: SystemStatusPage }
    ]
  },
  {
    label: "Support",
    description: "Diagnostics and troubleshooting.",
    collapsed: true,
    pages: [
      { label: "Scheduler Diagnostics", component: SchedulerDiagnosticsPage },
      { label: "Assignment Inspector", component: AssignmentsPage, id: "advanced-assignments" },
      { label: "Legacy Scheduler", component: SchedulerPage, id: "scheduler" },
      { label: "Schedule Preview", href: "#schedule-preview" }
    ]
  },
  {
    label: "Administration",
    description: "Platform configuration and governance.",
    pages: [
      { label: "Settings", component: SettingsPage },
      { label: "Audit", component: AuditPage }
    ],
    accessory: "admin-session"
  }
] satisfies NavigationGroup[];

const pages = pageGroups.flatMap((group) =>
  group.pages.filter((page): page is ComponentNavigationPage => "component" in page)
);

function toSectionId(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

function AdminSessionControl() {
  const [isUnlocked, setIsUnlocked] = useState(() => hasDashboardAdminKey());

  useEffect(() => subscribeDashboardAdminKeyChange(() => setIsUnlocked(hasDashboardAdminKey())), []);

  function handleChangeKey() {
    promptForDashboardAdminKey();
    setIsUnlocked(hasDashboardAdminKey());
  }

  function handleClearKey() {
    clearDashboardAdminKey();
    setIsUnlocked(hasDashboardAdminKey());
  }

  return (
    <section className={`admin-session ${isUnlocked ? "admin-session-unlocked" : "admin-session-locked"}`}>
      <div>
        <p className="admin-session-label">Admin session</p>
        <strong>{isUnlocked ? "Admin unlocked" : "Admin locked"}</strong>
      </div>
      <div className="admin-session-actions">
        <button type="button" onClick={handleChangeKey}>
          {isUnlocked ? "Change key" : "Enter key"}
        </button>
        <button type="button" onClick={handleClearKey}>
          Clear key
        </button>
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    </section>
  );
}

function pageHref(page: NavigationPage) {
  if ("href" in page) {
    return page.href;
  }

  return `#${page.id ?? toSectionId(page.label)}`;
}

function pageId(page: ComponentNavigationPage) {
  return page.id ?? toSectionId(page.label);
}

function currentHashPageId() {
  if (typeof window === "undefined") {
    return "dashboard";
  }

  return window.location.hash.replace(/^#/, "") || "dashboard";
}

function resolveActivePageId(hashPageId: string) {
  return pages.some((page) => pageId(page) === hashPageId) ? hashPageId : "dashboard";
}

function NavigationGroupSection({
  activePageId,
  group
}: {
  activePageId: string;
  group: NavigationGroup;
}) {
  const groupContainsActivePage = group.pages.some((page) => pageHref(page) === `#${activePageId}`);
  const content = (
    <>
      <p className="sidebar-nav-description">{group.description}</p>
      {group.pages.map((page) => (
        <a
          aria-current={pageHref(page) === `#${activePageId}` ? "page" : undefined}
          className={pageHref(page) === `#${activePageId}` ? "active" : undefined}
          href={pageHref(page)}
          key={page.label}
        >
          {page.label}
        </a>
      ))}
      {group.accessory === "admin-session" ? <AdminSessionControl /> : null}
    </>
  );

  if (group.collapsed) {
    return (
      <details className="sidebar-nav-group sidebar-nav-details" open={groupContainsActivePage || undefined}>
        <summary>
          <h2>{group.label}</h2>
        </summary>
        {content}
      </details>
    );
  }

  return (
    <section className="sidebar-nav-group">
      <h2>{group.label}</h2>
      {content}
    </section>
  );
}

export function App() {
  const [activePageId, setActivePageId] = useState(() => resolveActivePageId(currentHashPageId()));
  const activePage = pages.find((page) => pageId(page) === activePageId) ?? pages[0];
  const ActivePage = activePage.component;

  useEffect(() => {
    function handleHashChange() {
      setActivePageId(resolveActivePageId(currentHashPageId()));
    }

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Local-first</p>
          <h1>Narrowcasting</h1>
        </div>
        <nav aria-label="Dashboard sections">
          {pageGroups.map((group) => (
            <NavigationGroupSection activePageId={activePageId} group={group} key={group.label} />
          ))}
        </nav>
      </aside>
      <section className="content">
        <ActivePage key={activePageId} />
      </section>
    </main>
  );
}
