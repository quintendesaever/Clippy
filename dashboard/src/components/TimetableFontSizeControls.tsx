type TimetableFontSizeControlsProps = {
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
};

export default function TimetableFontSizeControls({
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
}: TimetableFontSizeControlsProps) {
  return (
    <div className="timetableFontSizeControls" role="group" aria-label="Tekstgrootte">
      <button
        type="button"
        className="timetableFontSizeBtn"
        onClick={onDecrease}
        disabled={!canDecrease}
        aria-label="Tekst verkleinen"
      >
        A−
      </button>
      <button
        type="button"
        className="timetableFontSizeBtn"
        onClick={onIncrease}
        disabled={!canIncrease}
        aria-label="Tekst vergroten"
      >
        A+
      </button>
    </div>
  );
}
