import { labelForTypeBadge } from "@shared/timetable/eventMeta";
import { useState } from "react";
import { deleteActivity, joinActivity, leaveActivity } from "../api";
import type { TimetableEventDto } from "../types";
import { webCalendarTitle } from "../lib/eventTitle";
import { useShowTypePrefix } from "../hooks/usePreferences";
import { formatTime } from "../lib/dates";
import AvatarStack from "./AvatarStack";
import Button from "./Button";

type EventPopupProps = {
  event: TimetableEventDto;
  currentUserId: string;
  timezone: string;
  avatarByUser?: Map<string, string | null>;
  onClose: () => void;
  onEdit?: (event: TimetableEventDto) => void;
  onDeleted?: () => void;
  onChanged?: () => void;
};

export default function EventPopup({
  event,
  currentUserId,
  timezone,
  avatarByUser,
  onClose,
  onEdit,
  onDeleted,
  onChanged,
}: EventPopupProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showTypePrefix = useShowTypePrefix();

  const showFullTitle = Boolean(event.rawTitle && event.rawTitle !== event.title);
  const typeLabels = event.typeBadges.map(labelForTypeBadge);
  const isActivity = event.source === "activity";
  const canManage =
    isActivity && event.createdBy === currentUserId && Boolean(event.id);
  const participants = event.participantIds?.length
    ? event.participantIds
    : isActivity
      ? [event.userId]
      : [];
  const isJoined = participants.includes(currentUserId);
  const canJoin = isActivity && Boolean(event.id) && !isJoined;
  const canLeave =
    isActivity && Boolean(event.id) && isJoined && event.createdBy !== currentUserId;

  async function handleDelete() {
    if (!event.id) return;
    if (!confirm("Deze activiteit verwijderen?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteActivity(event.id);
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!event.id) return;
    setBusy(true);
    setError(null);
    try {
      await joinActivity(event.id);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Meedoen mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (!event.id) return;
    setBusy(true);
    setError(null);
    try {
      await leaveActivity(event.id);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Afmeld mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="eventPopupOverlay" onClick={onClose}>
      <div className="eventPopup" onClick={(e) => e.stopPropagation()}>
        <div className="eventPopupHeader">
          <h3 className="eventPopupTitle">{webCalendarTitle(event, showTypePrefix)}</h3>
          <button
            type="button"
            className="eventPopupClose"
            onClick={onClose}
            aria-label="Sluiten"
          >
            ×
          </button>
        </div>
        <dl className="eventPopupBody">
          <dt>{isActivity ? "Door" : "Lid"}</dt>
          <dd>{event.initials}</dd>

          <dt>Tijd</dt>
          <dd>
            {event.allDay
              ? "Hele dag"
              : `${formatTime(event.start, timezone)} – ${formatTime(event.end, timezone)}`}
          </dd>

          {typeLabels.length > 0 && (
            <>
              <dt>Type</dt>
              <dd className="eventPopupType">{typeLabels.join(", ")}</dd>
            </>
          )}

          {isActivity && (
            <>
              <dt>Deelnemers</dt>
              <dd className="eventPopupParticipants">
                {avatarByUser ? (
                  <AvatarStack userIds={participants} avatarByUser={avatarByUser} size="sm" />
                ) : null}
                <span>{participants.length}</span>
              </dd>
            </>
          )}

          {(event.location || event.locationHidden) && (
            <>
              <dt>Locatie</dt>
              <dd className={event.locationHidden ? "locationBlurred" : undefined}>
                {event.locationHidden ? "Campus · lokaal" : event.location}
              </dd>
            </>
          )}

          {event.memberLocation && (
            <>
              <dt>Laatst gedetecteerde locatie</dt>
              <dd>{event.memberLocation}</dd>
            </>
          )}
        </dl>

        {(showFullTitle || event.description) && (
          <div className="eventPopupExtras">
            {showFullTitle && (
              <details className="eventPopupExpand">
                <summary>Volledige titel</summary>
                <p className="eventPopupDescription">{event.rawTitle}</p>
              </details>
            )}
            {event.description && (
              <details className="eventPopupExpand" open={isActivity}>
                <summary>Opmerkingen</summary>
                <p className="eventPopupDescription">{event.description}</p>
              </details>
            )}
          </div>
        )}

        {error && <p className="errorMsg">{error}</p>}

        {(canManage || canJoin || canLeave) && (
          <div className="formActions eventPopupActions">
            {canJoin && (
              <Button type="button" onClick={handleJoin} disabled={busy}>
                {busy ? "Bezig…" : "Meedoen"}
              </Button>
            )}
            {canLeave && (
              <Button variant="secondary" onClick={handleLeave} disabled={busy}>
                {busy ? "Bezig…" : "Afmelden"}
              </Button>
            )}
            {canManage && (
              <>
                <Button
                  type="button"
                  onClick={() => {
                    onEdit?.(event);
                    onClose();
                  }}
                  disabled={busy}
                >
                  Wijzigen
                </Button>
                <Button variant="secondary" onClick={handleDelete} disabled={busy}>
                  {busy ? "Verwijderen…" : "Verwijderen"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
