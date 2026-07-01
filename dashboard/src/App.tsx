import { useEffect, useState } from "react";
import { AdminSessionPage } from "./pages/AdminSessionPage";
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
import { SupportOverviewPage } from "./pages/SupportOverviewPage";
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
}

const pageGroups: NavigationGroup[] = [
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
      { label: "Support Overview", component: SupportOverviewPage, id: "support" },
      { label: "Scheduler Diagnostics", component: SchedulerDiagnosticsPage },
      { label: "Schedule Preview", href: "#schedule-preview" },
      { label: "Audit", component: AuditPage },
      { label: "Server Status", href: "#system-status" },
      { label: "Settings", component: SettingsPage },
      { label: "Admin Session", component: AdminSessionPage },
      { label: "Assignment Inspector", component: AssignmentsPage, id: "advanced-assignments" },
      { label: "Legacy Scheduler", component: SchedulerPage, id: "scheduler" }
    ]
  }
];

function isComponentPage(page: NavigationPage): page is ComponentNavigationPage {
  return typeof (page as Partial<ComponentNavigationPage>).component === "function";
}

const pages = pageGroups.flatMap((group) => group.pages.filter(isComponentPage));

function toSectionId(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-");
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
