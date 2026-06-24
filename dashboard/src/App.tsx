import { DashboardPage } from "./pages/DashboardPage";
import { MediaLibraryPage } from "./pages/MediaLibraryPage";
import { ProgramsPage } from "./pages/ProgramsPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { SchedulePreviewPage } from "./pages/SchedulePreviewPage";
import { SchedulerPage } from "./pages/SchedulerPage";
import { ScreensPage } from "./pages/ScreensPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SystemStatusPage } from "./pages/SystemStatusPage";

const pages = [
  { label: "Dashboard", component: DashboardPage },
  { label: "System Status", component: SystemStatusPage },
  { label: "Schedule Preview", component: SchedulePreviewPage },
  { label: "Media Library", component: MediaLibraryPage },
  { label: "Playlists", component: PlaylistsPage },
  { label: "Programs", component: ProgramsPage },
  { label: "Scheduler", component: SchedulerPage },
  { label: "Screens", component: ScreensPage },
  { label: "Settings", component: SettingsPage }
];

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
          {pages.map((page) => (
            <a href={`#${toSectionId(page.label)}`} key={page.label}>
              {page.label}
            </a>
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
