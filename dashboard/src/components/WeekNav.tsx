import Button from "./Button";

type WeekNavProps = {
  onPrev: () => void;
  onThisWeek: () => void;
  onNext: () => void;
};

export default function WeekNav({ onPrev, onThisWeek, onNext }: WeekNavProps) {
  return (
    <div className="timetableWeekNav">
      <Button variant="secondary" size="small" onClick={onPrev}>
        ← Vorige week
      </Button>
      <Button variant="secondary" size="small" onClick={onThisWeek}>
        Deze week
      </Button>
      <Button variant="secondary" size="small" onClick={onNext}>
        Volgende week →
      </Button>
    </div>
  );
}
