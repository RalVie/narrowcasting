function getDefaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  if (window.location.port === "3000") {
    return window.location.origin;
  }

  return `${window.location.protocol}//${window.location.hostname}:3000`;
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl();
const adminKeyStorageKey = "narrowcasting:admin-key";
const adminKeyHeader = "X-Narrowcasting-Admin-Key";
const adminKeyChangedEvent = "narrowcasting-admin-key-changed";
const protectedManagementReadPrefixes = [
  "/api/media",
  "/api/playlist",
  "/api/playlists",
  "/api/programs",
  "/api/themes",
  "/api/campaigns",
  "/api/assignments",
  "/api/screens",
  "/api/screen-groups",
  "/api/scheduler",
  "/api/status",
  "/api/player-cache",
  "/api/agent-status",
  "/api/audit"
];

export function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

function isMutationMethod(method: string) {
  const normalizedMethod = method.toUpperCase();

  return normalizedMethod !== "GET" && normalizedMethod !== "HEAD" && normalizedMethod !== "OPTIONS";
}

function isDashboardApiRequest(url: string) {
  try {
    const targetUrl = new URL(url, window.location.origin);
    const apiBase = new URL(apiBaseUrl);

    return targetUrl.origin === apiBase.origin && targetUrl.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function isProtectedDashboardRead(url: string) {
  try {
    const targetUrl = new URL(url, window.location.origin);

    return protectedManagementReadPrefixes.some(
      (prefix) => targetUrl.pathname === prefix || targetUrl.pathname.startsWith(`${prefix}/`)
    );
  } catch {
    return false;
  }
}

function notifyAdminKeyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(adminKeyChangedEvent));
  }
}

export function readDashboardAdminKey() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(adminKeyStorageKey)?.trim() || null;
}

export function hasDashboardAdminKey() {
  return Boolean(readDashboardAdminKey());
}

export function setDashboardAdminKey(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  const trimmedKey = key.trim();

  if (!trimmedKey) {
    return;
  }

  window.localStorage.setItem(adminKeyStorageKey, trimmedKey);
  notifyAdminKeyChanged();
}

export async function validateDashboardAdminKey(key = readDashboardAdminKey()) {
  const trimmedKey = key?.trim();

  if (!trimmedKey) {
    return false;
  }

  const response = await fetch(apiUrl("/api/admin/session"), {
    method: "POST",
    headers: {
      [adminKeyHeader]: trimmedKey
    }
  });

  if (response.ok) {
    return true;
  }

  if (response.status === 401 || response.status === 503) {
    clearDashboardAdminKey();
  }

  return false;
}

export async function promptAndValidateDashboardAdminKey() {
  const key = window.prompt("Enter the existing Narrowcasting admin key configured on the server.");

  if (!key?.trim()) {
    return false;
  }

  const trimmedKey = key.trim();
  const isValid = await validateDashboardAdminKey(trimmedKey);

  if (!isValid) {
    window.alert("The entered key does not match the admin key configured on the server.");
    return false;
  }

  setDashboardAdminKey(trimmedKey);
  return true;
}

export function clearDashboardAdminKey() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(adminKeyStorageKey);
  notifyAdminKeyChanged();
}

export function promptForDashboardAdminKey() {
  const key = window.prompt("Enter Narrowcasting admin key for management access.");

  if (key && key.trim()) {
    setDashboardAdminKey(key);
    return key.trim();
  }

  return null;
}

export function subscribeDashboardAdminKeyChange(callback: () => void) {
  window.addEventListener(adminKeyChangedEvent, callback);

  return () => window.removeEventListener(adminKeyChangedEvent, callback);
}

function getAdminKeyForProtectedRequest() {
  return readDashboardAdminKey() ?? promptForDashboardAdminKey();
}

function installAdminFetchBoundary() {
  if (typeof window === "undefined") {
    return;
  }

  const flag = "__narrowcastingAdminFetchInstalled";
  const win = window as Window & { __narrowcastingAdminFetchInstalled?: boolean };

  if (win[flag]) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (isDashboardApiRequest(url) && (isMutationMethod(method) || isProtectedDashboardRead(url))) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const adminKey = headers.has(adminKeyHeader) ? null : getAdminKeyForProtectedRequest();

      if (adminKey) {
        headers.set(adminKeyHeader, adminKey);
      }

      return originalFetch(input, {
        ...init,
        headers
      }).then((response) => {
        if (response.status === 401) {
          clearDashboardAdminKey();
        }

        return response;
      });
    }

    return originalFetch(input, init);
  };
  win[flag] = true;
}

installAdminFetchBoundary();
