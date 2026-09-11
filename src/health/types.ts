export type HealthState = "ok" | "degraded" | "unavailable" | "disabled";

export type ComponentReport = {
  status: HealthState;
  detail?: string;
};

export type StatusReport = {
  status: "ok" | "degraded" | "unavailable";
  checkedAt: string;
  uptimeSeconds: number;
  components: {
    discord: ComponentReport;
    supabase: ComponentReport;
    dashboard: ComponentReport;
    f1ReminderJob: ComponentReport;
    timetablePanelJob: ComponentReport;
  };
};

export type AdminStatusReport = StatusReport & {
  admin: {
    f1: {
      enabled: boolean;
      channelConfigured: boolean;
      roleConfigured: boolean;
      testMode: boolean;
    };
  };
};

export type StatusReportWithHistory = StatusReport & {
  history: StatusReport[];
};

export type AdminStatusReportWithHistory = AdminStatusReport & {
  history: StatusReport[];
};
