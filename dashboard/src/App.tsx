import { AssignmentsPage } from "./pages/AssignmentsPage";
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

const pageGroups = [
  {
    label: "Content",
    pages: [
      { label: "Media Library", component: MediaLibraryPage },
      { label: "Playlists", component: PlaylistsPage },
      { label: "Programs", component: ProgramsPage },
      { label: "Themes", component: ThemesPage }
    ]
  },
  {
    label: "Deployment",
    pages: [
      { label: "Screens", component: ScreensPage },
      { label: "Screen Groups", href: "#screens" },
      { label: "Campaigns", component: CampaignsPage }
    ]
  },
  {
    label: "Settings",
    pages: [
      { label: "Dashboard", component: DashboardPage },
      { label: "System Status", component: SystemStatusPage },
      { label: "Schedule Preview", component: SchedulePreviewPage },
      { label: "Scheduler", component: SchedulerPage },
      { label: "Scheduler Diagnostics", component: SchedulerDiagnosticsPage },
      { label: "Advanced Assignments", component: AssignmentsPage },
      { label: "General", component: SettingsPage }
    ]
  }
];

const pages = pageGroups.flatMap((group) =>
  group.pages.filter((page): page is { label: string; component: () => JSX.Element } => "component" in page)
);

function toSectionId(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

export function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Local-first</p>
          <h1>Narrowcasting</h1>
        </div>
        <nav aria-label="Dashboard sections">
          {pageGroups.map((group) => (
            <section className="sidebar-nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.pages.map((page) => (
                <a href={"href" in page ? page.href : `#${toSectionId(page.label)}`} key={page.label}>
                  {page.label}
                </a>
              ))}
            </section>
          ))}
        </nav>
      </aside>
      <section className="content">
        {pages.map(({ label, component: Page }) => (
          <Page key={label} />
        ))}
      </section>
    </main>
  );
}
