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

function readStoredAdminKey() {
  const envKey = import.meta.env.VITE_ADMIN_KEY;

  if (typeof envKey === "string" && envKey.trim()) {
    return envKey.trim();
  }

  return window.localStorage.getItem(adminKeyStorageKey)?.trim() || null;
}

function requestAdminKey() {
  const key = window.prompt("Enter Narrowcasting admin key for management changes.");

  if (key && key.trim()) {
    window.localStorage.setItem(adminKeyStorageKey, key.trim());
    return key.trim();
  }

  return null;
}

function getAdminKeyForMutation() {
  return readStoredAdminKey() ?? requestAdminKey();
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

    if (isMutationMethod(method) && isDashboardApiRequest(url)) {
      const adminKey = getAdminKeyForMutation();
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

      if (adminKey) {
        headers.set(adminKeyHeader, adminKey);
      }

      return originalFetch(input, {
        ...init,
        headers
      }).then((response) => {
        if (response.status === 401) {
          window.localStorage.removeItem(adminKeyStorageKey);
        }

        return response;
      });
    }

    return originalFetch(input, init);
  };
  win[flag] = true;
}

installAdminFetchBoundary();
