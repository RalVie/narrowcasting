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
  const [status, setStatus] = useState("Stored admin keys are validated by the server.");

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
        setStatus(isValid ? "Admin key accepted by the server." : "Stored admin key was rejected by the server.");
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
    setStatus(isValid ? "Admin key accepted by the server." : "Admin key was not accepted by the server.");
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
          <p>Manage the local dashboard admin key used for protected management actions.</p>
        </div>
      </div>

      <section className={`operator-panel admin-session-page-card ${isUnlocked ? "unlocked" : "locked"}`}>
        <div>
          <span>{isUnlocked ? "Unlocked" : "Locked"}</span>
          <h3>{isUnlocked ? "Session active" : "Admin key required"}</h3>
          <p>
            {isUnlocked
              ? "This browser has a server-validated admin session for protected dashboard reads and management actions."
              : "Enter the server admin key to unlock protected dashboard reads and management actions."}
          </p>
          <p className="operator-empty">{status}</p>
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
