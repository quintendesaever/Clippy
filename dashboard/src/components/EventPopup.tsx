import { labelForTypeBadge } from "@shared/timetable/eventMeta";
import type { TimetableEventDto } from "../types";
import { formatTime } from "../lib/dates";

type EventPopupProps = {
  event: TimetableEventDto;
  onClose: () => void;
};

export default function EventPopup({ event, onClose }: EventPopupProps) {
  const showFullTitle = Boolean(event.rawTitle && event.rawTitle !== event.title);
  const typeLabels = event.typeBadges.map(labelForTypeBadge);

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
          <dt>Lid</dt>
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
              <details className="eventPopupExpand">
                <summary>Opmerkingen</summary>
                <p className="eventPopupDescription">{event.description}</p>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
