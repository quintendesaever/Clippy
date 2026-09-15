import { useEffect, useState } from "react";
import type { ActivityFormPrefill } from "../components/ActivityForm";
import type { TimetableEventDto } from "../types";

/**
 * Shared create/edit popup state for timetable pages.
 */
export function useTimetableActivityUi(activities: TimetableEventDto[]) {
  const [popupEvent, setPopupEvent] = useState<TimetableEventDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editEvent, setEditEvent] = useState<TimetableEventDto | null>(null);
  const [formPrefill, setFormPrefill] = useState<ActivityFormPrefill | null>(null);

  useEffect(() => {
    if (!popupEvent?.id) return;
    const updated = activities.find((activity) => activity.id === popupEvent.id);
    if (updated) setPopupEvent(updated);
  }, [activities, popupEvent?.id]);

  function openCreate(prefill?: ActivityFormPrefill | null) {
    setFormMode("create");
    setEditEvent(null);
    setFormPrefill(prefill ?? null);
    setFormOpen(true);
  }

  function openEdit(event: TimetableEventDto) {
    setFormMode("edit");
    setEditEvent(event);
    setFormPrefill(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
  }

  function closePopup() {
    setPopupEvent(null);
  }

  return {
    popupEvent,
    setPopupEvent,
    formOpen,
    formMode,
    editEvent,
    formPrefill,
    openCreate,
    openEdit,
    closeForm,
    closePopup,
  };
}
