export type HealthState = "ok" | "degraded" | "unavailable" | "disabled";

export type ComponentReport = {
  status: HealthState;
  detail?: string;
  latencyMs?: number;
};

export type StatusSummary = {
  ok: number;
  degraded: number;
  unavailable: number;
  disabled: number;
};

export type StatusRuntime = {
  nodeEnv: string;
  processStartedAt: string;
  historyCapacity: number;
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
  summary: StatusSummary;
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
  runtime: StatusRuntime;
};

export type StatusReportWithHistory = StatusReport & {
  history: StatusReport[];
};

export type AdminStatusReportWithHistory = AdminStatusReport & {
  history: StatusReport[];
};
