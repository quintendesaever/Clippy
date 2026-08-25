import {
  descriptionContainsLocation,
  redactLocationFromDescription,
} from "../../shared/timetable/eventMeta.js";
import type { TimetableEvent } from "./types.js";

export type MemberGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export type SerializeEventOptions = {
  viewerUserId?: string;
  viewerIsAdmin?: boolean;
  shareLocationByUser?: Map<string, boolean>;
  /** @deprecated Use shareLocationByUser; kept as an alias for ICS opt-in maps. */
  showLocationByUser?: Map<string, boolean>;
  memberGeoByUser?: Map<string, MemberGeo>;
};

function formatMemberLocation(geo: MemberGeo | undefined): string | null {
  if (!geo) return null;
  const parts: string[] = [];
  if (geo.city?.trim()) parts.push(geo.city.trim());
  if (geo.region?.trim() && geo.region.trim() !== geo.city?.trim()) parts.push(geo.region.trim());
  if (
    geo.country?.trim() &&
    geo.country.trim() !== geo.region?.trim() &&
    geo.country.trim() !== geo.city?.trim()
  ) {
    parts.push(geo.country.trim());
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

export function serializeEventForApi(event: TimetableEvent, options?: SerializeEventOptions) {
  const source = event.source ?? "ics";
  const isActivity = source === "activity";
  const hasLocationField = Boolean(event.location?.trim());
  const hasLocationInDescription = descriptionContainsLocation(event.description);
  const hasLocation = hasLocationField || hasLocationInDescription;
  const privacyUserId = event.createdBy ?? event.userId;
  const isPrivacyOwner = options?.viewerUserId != null && options.viewerUserId === privacyUserId;
  const shareMap = options?.shareLocationByUser ?? options?.showLocationByUser;
  const ownerAllowsLocation = shareMap?.get(privacyUserId) === true;
  const viewerIsAdmin = options?.viewerIsAdmin === true;
  const personalLocationVisible = isPrivacyOwner || ownerAllowsLocation || viewerIsAdmin;
  // Shared activity venues stay public; ICS rooms follow the member preference.
  const locationVisible = isActivity || personalLocationVisible;
  const memberLocation =
    personalLocationVisible ? formatMemberLocation(options?.memberGeoByUser?.get(privacyUserId)) : null;

  return {
    userId: event.userId,
    initials: event.initials,
    title: event.title,
    rawTitle: event.rawTitle,
    typeBadges: event.typeBadges,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    allDay: event.allDay,
    location: locationVisible ? (event.location ?? null) : null,
    locationHidden: hasLocation && !locationVisible,
    ...(memberLocation ? { memberLocation } : {}),
    description: locationVisible
      ? (event.description ?? null)
      : (redactLocationFromDescription(event.description) ?? null),
    source,
    ...(event.id ? { id: event.id } : {}),
    ...(event.createdBy ? { createdBy: event.createdBy } : {}),
    ...(event.participantIds?.length ? { participantIds: event.participantIds } : {}),
  };
}
