import { useEffect, useState } from "react";
import {
  clearDashboardAdminKey,
  hasDashboardAdminKey,
  promptForDashboardAdminKey,
  subscribeDashboardAdminKeyChange
} from "../api/apiBase";

export function AdminSessionPage() {
  const [isUnlocked, setIsUnlocked] = useState(() => hasDashboardAdminKey());

  useEffect(() => subscribeDashboardAdminKeyChange(() => setIsUnlocked(hasDashboardAdminKey())), []);

  function refreshState() {
    setIsUnlocked(hasDashboardAdminKey());
  }

  function unlockOrChangeKey() {
    promptForDashboardAdminKey();
    refreshState();
  }

  function clearKey() {
    clearDashboardAdminKey();
    refreshState();
  }

  return (
    <section className="page-section" id="admin-session">
      <div className="section-heading">
        <div>
          <h2>Admin Session</h2>
          <p>Manage the local dashboard admin key used for protected management actions.</p>
        </div>
      </div>

      <section className={`operator-panel admin-session-page-card ${isUnlocked ? "unlocked" : "locked"}`}>
        <div>
          <span>{isUnlocked ? "Unlocked" : "Locked"}</span>
          <h3>{isUnlocked ? "Session active" : "Admin key required"}</h3>
          <p>
            {isUnlocked
              ? "This browser can access protected dashboard reads and management actions."
              : "Enter the admin key to unlock protected dashboard reads and management actions."}
          </p>
        </div>

        <div className="admin-session-page-actions">
          <button onClick={unlockOrChangeKey} type="button">
            {isUnlocked ? "Change key" : "Unlock"}
          </button>
          <button onClick={clearKey} type="button">
            Clear key
          </button>
          <button onClick={() => window.location.reload()} type="button">
            Retry current page
          </button>
        </div>
      </section>
    </section>
  );
}
