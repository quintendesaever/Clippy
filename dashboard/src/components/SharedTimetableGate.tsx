import { Link } from "react-router-dom";
import Button from "./Button";
import PagePanel from "./PagePanel";

export default function SharedTimetableGate() {
  return (
    <PagePanel className="pagePanelNarrow timetableGate">
      <h2 className="cardTitle">Koppel je kalender om het gedeelde rooster te zien</h2>
      <p className="cardHint">
        Een ICS-kalenderkoppeling is verplicht om het gedeelde rooster te gebruiken.
      </p>
      <div className="formActions">
        <Link to="/settings">
          <Button type="button">ICS-kalender koppelen</Button>
        </Link>
      </div>
    </PagePanel>
  );
}
