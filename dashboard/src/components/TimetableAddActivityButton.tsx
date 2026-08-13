type TimetableAddActivityButtonProps = {
  onClick: () => void;
};

export default function TimetableAddActivityButton({
  onClick,
}: TimetableAddActivityButtonProps) {
  return (
    <div className="timetableAddActivityControls">
      <button
        type="button"
        className="timetableFontSizeBtn"
        onClick={onClick}
        aria-label="Activiteit toevoegen"
        title="Activiteit toevoegen"
      >
        +
      </button>
    </div>
  );
}
