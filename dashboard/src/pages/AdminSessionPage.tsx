import { useEffect, useState } from "react";
import {
  clearDashboardAdminKey,
  hasDashboardAdminKey,
  promptAndValidateDashboardAdminKey,
  subscribeDashboardAdminKeyChange,
  validateDashboardAdminKey
} from "../api/apiBase";

export function AdminSessionPage() {
  const [isUnlocked, setIsUnlocked] = useState(() => hasDashboardAdminKey());
  const [status, setStatus] = useState("Stored browser sessions are validated by the server.");

  useEffect(() => {
    let isMounted = true;

    async function refreshValidatedState() {
      if (!hasDashboardAdminKey()) {
        if (isMounted) {
          setIsUnlocked(false);
          setStatus("No admin session is stored in this browser.");
        }
        return;
      }

      const isValid = await validateDashboardAdminKey();

      if (isMounted) {
        setIsUnlocked(isValid);
        setStatus(
          isValid
            ? "Admin key accepted by the server."
            : "The stored key does not match the admin key configured on the server."
        );
      }
    }

    refreshValidatedState();

    const unsubscribe = subscribeDashboardAdminKeyChange(refreshValidatedState);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  function refreshState() {
    setIsUnlocked(hasDashboardAdminKey());
  }

  async function unlockOrChangeKey() {
    setStatus("Validating admin key with the server...");
    const isValid = await promptAndValidateDashboardAdminKey();
    setIsUnlocked(isValid);
    setStatus(
      isValid
        ? "Admin key accepted by the server."
        : "The entered key does not match the admin key configured on the server."
    );
  }

  function clearKey() {
    clearDashboardAdminKey();
    refreshState();
    setStatus("Admin session cleared in this browser.");
  }

  return (
    <section className="page-section" id="admin-session">
      <div className="section-heading">
        <div>
          <h2>Admin Session</h2>
          <p>Unlock this browser with the existing admin key configured on the server.</p>
        </div>
      </div>

      <section className={`operator-panel admin-session-page-card ${isUnlocked ? "unlocked" : "locked"}`}>
        <div>
          <span>{isUnlocked ? "Unlocked" : "Locked"}</span>
          <h3>{isUnlocked ? "Session active" : "Admin key required"}</h3>
          <p>
            {isUnlocked
              ? "This browser has a server-validated admin session for protected dashboard reads and management actions."
              : "Enter the existing server admin key to unlock protected dashboard reads and management actions."}
          </p>
          <p className="operator-empty">This is the existing admin key configured on the server.</p>
          <p className="operator-empty">{status}</p>
        </div>

        <div className="admin-session-page-actions">
          <button onClick={unlockOrChangeKey} type="button">
            {isUnlocked ? "Use different key" : "Unlock"}
          </button>
          <button onClick={clearKey} type="button">
            Clear key
          </button>
          <button onClick={() => window.location.reload()} type="button">
            Retry current page
          </button>
        </div>
      </section>

      <section className="operator-panel">
        <h3>Changing the server admin key</h3>
        <p>The server admin key is configured on the server, not in the Dashboard.</p>
        <ol>
          <li>
            Edit <code>/etc/narrowcasting/server.env</code>.
          </li>
          <li>
            Change <code>NARROWCASTING_ADMIN_KEY=...</code>.
          </li>
          <li>
            Restart with <code>sudo systemctl restart narrowcasting-server</code>.
          </li>
        </ol>
      </section>
    </section>
  );
}
