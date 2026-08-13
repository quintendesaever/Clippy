import type {
  ActivityInput,
  ActivityResponse,
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
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function getMe(): Promise<MeResponse> {
  return fetchApi<MeResponse>("/api/me");
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
  show_location?: boolean;
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
