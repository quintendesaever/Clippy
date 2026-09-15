import type { TimetableLayout } from "../hooks/useTimetableLayout";
import Button from "./Button";

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
      <Button
        variant="secondary"
        size="small"
        className={value === "agenda" ? "timetableLayoutBtnActive" : ""}
        onClick={() => onChange("agenda")}
        aria-pressed={value === "agenda"}
      >
        Lijst
      </Button>
      <Button
        variant="secondary"
        size="small"
        className={value === "timeline" ? "timetableLayoutBtnActive" : ""}
        onClick={() => onChange("timeline")}
        aria-pressed={value === "timeline"}
      >
        {timelineLabel}
      </Button>
    </div>
  );
}
