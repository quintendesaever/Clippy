import type {
  ActivityInput,
  ActivityResponse,
  AdminRangePreset,
  AdminStatsResponse,
  AdminUsersResponse,
  CalendarResponse,
  CalendarsResponse,
  MeResponse,
  TimetableResponse,
} from "./types";

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 && window.location.pathname !== "/") {
    window.location.assign("/");
    throw new Error("Not authenticated");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function getMe(): Promise<MeResponse> {
  return fetchApi<MeResponse>("/api/me");
}

export async function savePreferences(data: {
  show_type_prefix?: boolean;
  share_location?: boolean;
}): Promise<{ show_type_prefix: boolean; share_location: boolean }> {
  return fetchApi<{ show_type_prefix: boolean; share_location: boolean }>("/api/preferences", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function recordPageView(path: string): Promise<void> {
  try {
    await fetch("/api/analytics/pageview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  } catch {
    // Analytics must never break the dashboard.
  }
}

export async function getAdminStats(range: AdminRangePreset): Promise<AdminStatsResponse> {
  const params = new URLSearchParams({ range });
  return fetchApi<AdminStatsResponse>(`/api/admin/stats?${params}`);
}

export async function getAdminUsers(): Promise<AdminUsersResponse> {
  return fetchApi<AdminUsersResponse>("/api/admin/users");
}

export async function logout(): Promise<void> {
  await fetchApi<{ ok: boolean }>("/api/logout", { method: "POST" });
}

export async function getCalendar(): Promise<CalendarResponse> {
  return fetchApi<CalendarResponse>("/api/calendar");
}

export async function getCalendars(): Promise<CalendarsResponse> {
  return fetchApi<CalendarsResponse>("/api/calendars");
}

export async function getTimetable(from: string, to: string): Promise<TimetableResponse> {
  const params = new URLSearchParams({ from, to });
  return fetchApi<TimetableResponse>(`/api/timetable?${params}`);
}

export async function saveCalendar(data: {
  initials: string;
  ics_url?: string;
  timezone?: string;
}): Promise<CalendarResponse> {
  return fetchApi<CalendarResponse>("/api/calendar", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteCalendar(): Promise<void> {
  await fetchApi<{ ok: boolean }>("/api/calendar", { method: "DELETE" });
}

export async function createActivity(data: ActivityInput): Promise<ActivityResponse> {
  return fetchApi<ActivityResponse>("/api/activities", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateActivity(
  id: string,
  data: ActivityInput
): Promise<ActivityResponse> {
  return fetchApi<ActivityResponse>(`/api/activities/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteActivity(id: string): Promise<void> {
  await fetchApi<{ ok: boolean }>(`/api/activities/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function joinActivity(id: string): Promise<void> {
  await fetchApi<{ ok: boolean }>(`/api/activities/${encodeURIComponent(id)}/join`, {
    method: "POST",
  });
}

export async function leaveActivity(id: string): Promise<void> {
  await fetchApi<{ ok: boolean }>(`/api/activities/${encodeURIComponent(id)}/join`, {
    method: "DELETE",
  });
}
