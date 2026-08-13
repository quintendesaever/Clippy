import { labelForTypeBadge } from "@shared/timetable/eventMeta";
import { useState } from "react";
import { deleteActivity } from "../api";
import type { TimetableEventDto } from "../types";
import { formatTime } from "../lib/dates";
import Button from "./Button";

type EventPopupProps = {
  event: TimetableEventDto;
  currentUserId: string;
  onClose: () => void;
  onEdit?: (event: TimetableEventDto) => void;
  onDeleted?: () => void;
};

export default function EventPopup({
  event,
  currentUserId,
  onClose,
  onEdit,
  onDeleted,
}: EventPopupProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showFullTitle = Boolean(event.rawTitle && event.rawTitle !== event.title);
  const typeLabels = event.typeBadges.map(labelForTypeBadge);
  const isActivity = event.source === "activity";
  const canManage =
    isActivity && event.createdBy === currentUserId && Boolean(event.id);

  async function handleDelete() {
    if (!event.id) return;
    if (!confirm("Deze activiteit verwijderen?")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteActivity(event.id);
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="eventPopupOverlay" onClick={onClose}>
      <div className="eventPopup" onClick={(e) => e.stopPropagation()}>
        <div className="eventPopupHeader">
          <h3 className="eventPopupTitle">{event.title}</h3>
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
            {formatTime(event.start)} – {formatTime(event.end)}
          </dd>

          {typeLabels.length > 0 && (
            <>
              <dt>Type</dt>
              <dd className="eventPopupType">{typeLabels.join(", ")}</dd>
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

        {canManage && (
          <div className="formActions eventPopupActions">
            <Button
              type="button"
              onClick={() => {
                onEdit?.(event);
                onClose();
              }}
              disabled={deleting}
            >
              Wijzigen
            </Button>
            <Button
              variant="secondary"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Verwijderen…" : "Verwijderen"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
