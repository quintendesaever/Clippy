import type { TimetableLayout } from "../hooks/useTimetableLayout";

type TimetableLayoutToggleProps = {
  value: TimetableLayout;
  onChange: (layout: TimetableLayout) => void;
  /** Label for the non-list view (timeline or personal grid). */
  timelineLabel?: string;
};

export default function TimetableLayoutToggle({
  value,
  onChange,
  timelineLabel = "Tijdlijn",
}: TimetableLayoutToggleProps) {
  return (
    <div className="timetableLayoutToggle" role="group" aria-label="Weergave">
      <button
        type="button"
        className={`timetableLayoutBtn${value === "agenda" ? " timetableLayoutBtnActive" : ""}`}
        onClick={() => onChange("agenda")}
        aria-pressed={value === "agenda"}
      >
        Lijst
      </button>
      <button
        type="button"
        className={`timetableLayoutBtn${value === "timeline" ? " timetableLayoutBtnActive" : ""}`}
        onClick={() => onChange("timeline")}
        aria-pressed={value === "timeline"}
      >
        {timelineLabel}
      </button>
    </div>
  );
}
