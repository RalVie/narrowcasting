export function SettingsPage() {
  return (
    <section className="page-section" id="settings">
      <div className="section-heading">
        <div>
          <h2>Settings</h2>
          <p>Local platform configuration areas. Settings are grouped for future expansion.</p>
        </div>
      </div>

      <div className="settings-section-grid">
        <section className="operator-panel">
          <div className="operator-panel-header">
            <h3>General</h3>
            <span>Local appliance</span>
          </div>
          <p className="operator-empty">General appliance settings will live here.</p>
        </section>

        <section className="operator-panel">
          <div className="operator-panel-header">
            <h3>Publishing</h3>
            <span>Campaign workflow</span>
          </div>
          <p className="operator-empty">Publishing defaults and workflow options will live here.</p>
        </section>

        <section className="operator-panel">
          <div className="operator-panel-header">
            <h3>Security</h3>
            <span>Access boundary</span>
          </div>
          <p className="operator-empty">Admin key and device-auth policy are managed by deployment configuration.</p>
        </section>

        <section className="operator-panel">
          <div className="operator-panel-header">
            <h3>Administration</h3>
            <span>Governance</span>
          </div>
          <p className="operator-empty">Audit, session, and support tools are available from the Support workspace.</p>
        </section>
      </div>
    </section>
  );
}
