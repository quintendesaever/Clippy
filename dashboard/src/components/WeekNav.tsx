type WeekNavProps = {
  onPrev: () => void;
  onThisWeek: () => void;
  onNext: () => void;
  disabled?: boolean;
  isCurrentWeek?: boolean;
};

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" width="16" height="16">
      <path
        fillRule="evenodd"
        d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" width="16" height="16">
      <path
        fillRule="evenodd"
        d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function WeekNav({
  onPrev,
  onThisWeek,
  onNext,
  disabled,
  isCurrentWeek = false,
}: WeekNavProps) {
  return (
    <div className="timetableWeekNav" role="group" aria-label="Week">
      <button
        type="button"
        className="weekNavIconBtn weekNavPrev"
        onClick={onPrev}
        disabled={disabled}
        aria-label="Vorige week"
      >
        <ChevronLeftIcon />
      </button>
      <button
        type="button"
        className={`weekNavThisWeek${isCurrentWeek ? " weekNavThisWeekActive" : ""}`}
        onClick={onThisWeek}
        disabled={disabled}
        aria-pressed={isCurrentWeek}
        aria-label="Deze week"
      >
        <span className="weekNavThisWeekFull">Deze week</span>
        <span className="weekNavThisWeekShort" aria-hidden="true">
          <span>Deze</span>
          <span>week</span>
        </span>
      </button>
      <button
        type="button"
        className="weekNavIconBtn weekNavNext"
        onClick={onNext}
        disabled={disabled}
        aria-label="Volgende week"
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}
