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

export function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}
