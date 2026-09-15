import type { ReactNode } from "react";
import ActivityForm, { type ActivityFormPrefill } from "./ActivityForm";
import AppShell from "./AppShell";
import EventPopup from "./EventPopup";
import TimetableAddActivityButton from "./TimetableAddActivityButton";
import TimetableFontSizeControls from "./TimetableFontSizeControls";
import type { DiscordUser, TimetableEventDto } from "../types";

type TimetablePageShellProps = {
  user: DiscordUser;
  timezone: string;
  fontScale: number;
  avatarByUser: Map<string, string | null>;
  error?: string | null;
  children: ReactNode;
  onAddActivity: () => void;
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  canDecreaseFont: boolean;
  canIncreaseFont: boolean;
  popupEvent: TimetableEventDto | null;
  onClosePopup: () => void;
  onEditEvent: (event: TimetableEventDto) => void;
  onPopupDeleted: () => void;
  onPopupChanged: () => void;
  formOpen: boolean;
  formMode: "create" | "edit";
  editEvent: TimetableEventDto | null;
  formPrefill: ActivityFormPrefill | null;
  onCloseForm: () => void;
  onFormSaved: () => void;
  /** Hide floating add/font controls (e.g. ICS gate). */
  hideChrome?: boolean;
};

export default function TimetablePageShell({
  user,
  timezone,
  fontScale,
  avatarByUser,
  error,
  children,
  onAddActivity,
  onDecreaseFont,
  onIncreaseFont,
  canDecreaseFont,
  canIncreaseFont,
  popupEvent,
  onClosePopup,
  onEditEvent,
  onPopupDeleted,
  onPopupChanged,
  formOpen,
  formMode,
  editEvent,
  formPrefill,
  onCloseForm,
  onFormSaved,
  hideChrome = false,
}: TimetablePageShellProps) {
  return (
    <AppShell user={user}>
      <div
        className="pageLayout timetablePage"
        style={{ "--tt-font-scale": fontScale } as React.CSSProperties}
      >
        <div className="pageLayoutContent">
          {error && <p className="errorMsg">{error}</p>}
          {children}
        </div>
        {!hideChrome && (
          <>
            <TimetableAddActivityButton onClick={onAddActivity} />
            <TimetableFontSizeControls
              onDecrease={onDecreaseFont}
              onIncrease={onIncreaseFont}
              canDecrease={canDecreaseFont}
              canIncrease={canIncreaseFont}
            />
          </>
        )}
      </div>

      {popupEvent && (
        <EventPopup
          event={popupEvent}
          currentUserId={user.id}
          timezone={timezone}
          avatarByUser={avatarByUser}
          onClose={onClosePopup}
          onEdit={onEditEvent}
          onDeleted={onPopupDeleted}
          onChanged={onPopupChanged}
        />
      )}
      {formOpen && (
        <ActivityForm
          mode={formMode}
          timezone={timezone}
          initial={editEvent}
          prefill={formPrefill}
          onClose={onCloseForm}
          onSaved={onFormSaved}
        />
      )}
    </AppShell>
  );
}
