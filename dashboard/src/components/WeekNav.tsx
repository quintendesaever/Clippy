import Button from "./Button";

type WeekNavProps = {
  weekLabel?: string;
  onPrev: () => void;
  onThisWeek: () => void;
  onNext: () => void;
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

export default function WeekNav({ weekLabel, onPrev, onThisWeek, onNext }: WeekNavProps) {
  return (
    <div className="timetableWeekNav">
      <Button
        variant="secondary"
        size="small"
        className="weekNavIconBtn weekNavPrev"
        onClick={onPrev}
        aria-label="Vorige week"
      >
        <ChevronLeftIcon />
      </Button>
      {weekLabel && <span className="weekNavRange">{weekLabel}</span>}
      <Button variant="secondary" size="small" className="weekNavThisWeek" onClick={onThisWeek}>
        Deze week
      </Button>
      <Button
        variant="secondary"
        size="small"
        className="weekNavIconBtn weekNavNext"
        onClick={onNext}
        aria-label="Volgende week"
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
