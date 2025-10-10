// Use environment variable if set (dev), otherwise use production path
// In dev: Vite proxy will handle /api -> localhost:8787/api
// In prod: Caddy serves at /ui/api
const API = import.meta.env.VITE_API_BASE || "/ui/api";

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

// Helper function for authenticated fetch
async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers
    },
    credentials: 'include'
  });

  // If unauthorized, redirect to login
  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/ui/login';
    throw new Error('Session expired. Please login again.');
  }

  return response;
}

export async function listFiles(ext: "json" | "conf" | "all" = "all") {
  const r = await authenticatedFetch(`${API}/files?ext=${ext}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchFile(name: string) {
  const r = await authenticatedFetch(`${API}/file/${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function parseFile(name: string) {
  const r = await authenticatedFetch(`${API}/parse/${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function resolveSpec(spec: any) {
  const r = await authenticatedFetch(`${API}/resolve`, {
    method: "POST",
    body: JSON.stringify({ spec })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveChanges(payload: { changes: any[]; spec: any; changeTag: string; ifMatch?: string; }) {
  const r = await authenticatedFetch(`${API}/save`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (r.status === 409) {
    const data = await r.json();
    throw Object.assign(new Error("File changed on disk"), { conflict: data });
  }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// User Management API
export async function getUsers() {
  const r = await authenticatedFetch(`${API}/auth/users`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createUser(userData: any) {
  const r = await authenticatedFetch(`${API}/auth/users`, {
    method: "POST",
    body: JSON.stringify(userData)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateUser(userId: number, updates: any) {
  const r = await authenticatedFetch(`${API}/auth/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(updates)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteUser(userId: number) {
  const r = await authenticatedFetch(`${API}/auth/users/${userId}`, {
    method: "DELETE"
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function toggleUserActive(userId: number) {
  const r = await authenticatedFetch(`${API}/auth/users/${userId}/toggle-active`, {
    method: "POST"
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function forcePasswordChange(userId: number) {
  const r = await authenticatedFetch(`${API}/auth/users/${userId}/force-password-change`, {
    method: "POST"
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const r = await authenticatedFetch(`${API}/auth/change-password`, {
    method: "POST",
    body: JSON.stringify({
      currentPassword,
      newPassword
    })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateSettings(settings: { timezone: string }) {
  const r = await authenticatedFetch(`${API}/auth/settings`, {
    method: "PUT",
    body: JSON.stringify(settings)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchStats24h(timeRange?: string) {
  const url = timeRange
    ? `${API}/stats/24h?timeRange=${encodeURIComponent(timeRange)}`
    : `${API}/stats/24h`;
  const r = await authenticatedFetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function checkPromptGuardHealth() {
  try {
    // Check Prompt Guard API health via backend proxy
    const r = await authenticatedFetch(`${API}/prompt-guard/health`);
    if (!r.ok) return false;
    const data = await r.json();
    return data.status === 'healthy' && data.model_loaded === true;
  } catch (error) {
    return false;
  }
}

export async function fetchPromptList(timeRange: string) {
  const r = await authenticatedFetch(`${API}/prompts/list?timeRange=${encodeURIComponent(timeRange)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchPromptDetails(id: string) {
  const r = await authenticatedFetch(`${API}/prompts/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Configuration File Manager API
export async function listConfigFiles() {
  const r = await authenticatedFetch(`${API}/config-files/list`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function downloadConfigFile(filename: string) {
  const r = await authenticatedFetch(`${API}/config-files/download/${encodeURIComponent(filename)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.text();
}

export async function uploadConfigFile(expectedFilename: string, content: string, actualFilename: string) {
  const r = await authenticatedFetch(`${API}/config-files/upload/${encodeURIComponent(expectedFilename)}`, {
    method: "POST",
    body: JSON.stringify({ content, filename: actualFilename })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchAuditLog() {
  const r = await authenticatedFetch(`${API}/config-files/audit-log`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
