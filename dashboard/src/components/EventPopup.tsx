import type { TimetableEventDto } from "../types";
import { formatTime } from "../lib/dates";

type EventPopupProps = {
  event: TimetableEventDto;
  onClose: () => void;
};

export default function EventPopup({ event, onClose }: EventPopupProps) {
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
          <dt>Tijd</dt>
          <dd>
            {formatTime(event.start)} – {formatTime(event.end)}
          </dd>
          <dt>Lid</dt>
          <dd>{event.initials}</dd>
          {event.typeBadges.length > 0 && (
            <>
              <dt>Type</dt>
              <dd>{event.typeBadges.join(", ")}</dd>
            </>
          )}
          {event.location && (
            <>
              <dt>Locatie</dt>
              <dd>{event.location}</dd>
            </>
          )}
          {event.description && (
            <>
              <dt>Opmerkingen</dt>
              <dd className="eventPopupDescription">{event.description}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
