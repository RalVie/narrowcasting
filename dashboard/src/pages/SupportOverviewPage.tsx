const supportSections = [
  {
    title: "Diagnostics",
    description: "Inspect resolver decisions and preview resolved schedules.",
    links: [
      { href: "#scheduler-diagnostics", label: "Scheduler Diagnostics" },
      { href: "#schedule-preview", label: "Schedule Preview" }
    ]
  },
  {
    title: "Operations",
    description: "Review operational events, device registration, and pending approvals.",
    links: [
      { href: "#audit", label: "Audit" },
      { href: "#screens", label: "Device Registration" },
      { href: "#screens", label: "Pending Approvals" }
    ]
  },
  {
    title: "Platform",
    description: "Check server status, versions, runtime state, and legacy scheduler data.",
    links: [
      { href: "#system-status", label: "Server Status" },
      { href: "#system-status", label: "Version Information" },
      { href: "#system-status", label: "Runtime Information" },
      { href: "#scheduler", label: "Legacy Scheduler" }
    ]
  },
  {
    title: "Administration",
    description: "Manage local dashboard access and platform settings.",
    links: [
      { href: "#settings", label: "Settings" },
      { href: "#admin-session", label: "Admin Session" },
      { href: "#advanced-assignments", label: "Assignment Inspector" }
    ]
  }
];

export function SupportOverviewPage() {
  return (
    <section className="page-section" id="support">
      <div className="section-heading">
        <div>
          <h2>Support</h2>
          <p>Diagnostics and administration tools for installers, administrators, and support engineers.</p>
        </div>
      </div>

      <div className="support-overview-grid">
        {supportSections.map((section) => (
          <article className="support-overview-card" key={section.title}>
            <div>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </div>
            <div className="support-overview-links">
              {section.links.map((link) => (
                <a href={link.href} key={`${section.title}-${link.label}`}>
                  {link.label}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
