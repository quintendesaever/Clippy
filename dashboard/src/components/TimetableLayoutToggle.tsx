import type { TimetableLayout } from "../hooks/useTimetableLayout";

type TimetableLayoutToggleProps = {
  value: TimetableLayout;
  onChange: (layout: TimetableLayout) => void;
};

export default function TimetableLayoutToggle({ value, onChange }: TimetableLayoutToggleProps) {
  return (
    <div className="topBarTabs timetableLayoutToggle" role="group" aria-label="Weergave">
      <button
        type="button"
        className={`topBarTab ${value === "agenda" ? "topBarTabActive" : ""}`}
        onClick={() => onChange("agenda")}
        aria-pressed={value === "agenda"}
      >
        Lijst
      </button>
      <button
        type="button"
        className={`topBarTab ${value === "timeline" ? "topBarTabActive" : ""}`}
        onClick={() => onChange("timeline")}
        aria-pressed={value === "timeline"}
      >
        Tijdlijn
      </button>
    </div>
  );
}
