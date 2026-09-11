import type {
  AdminStatusReport,
  AdminStatusReportWithHistory,
  StatusReport,
  StatusReportWithHistory,
} from "./types.js";

export const DEFAULT_STATUS_HISTORY_LIMIT = 20;

export type StatusHistoryStore = {
  readonly capacity?: number;
  record(report: StatusReport): void;
  recent(): StatusReport[];
  prior(): StatusReport[];
};

export function getStatusHistoryLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.STATUS_HISTORY_LIMIT?.trim();
  if (!raw) return DEFAULT_STATUS_HISTORY_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_STATUS_HISTORY_LIMIT;
  return parsed;
}

function cloneStatusReport(report: StatusReport): StatusReport {
  return structuredClone({
    status: report.status,
    checkedAt: report.checkedAt,
    uptimeSeconds: report.uptimeSeconds,
    components: report.components,
    summary: report.summary,
  });
}

export class StatusHistory implements StatusHistoryStore {
  readonly capacity: number;
  private readonly entries: StatusReport[] = [];

  constructor(capacity: number = getStatusHistoryLimit()) {
    this.capacity =
      Number.isInteger(capacity) && capacity > 0 ? capacity : DEFAULT_STATUS_HISTORY_LIMIT;
  }

  record(report: StatusReport): void {
    this.entries.push(cloneStatusReport(report));
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  recent(): StatusReport[] {
    return this.entries.slice().reverse().map(cloneStatusReport);
  }

  prior(): StatusReport[] {
    if (this.entries.length <= 1) return [];
    return this.entries.slice(0, -1).reverse().map(cloneStatusReport);
  }
}

let processHistory: StatusHistory | undefined;

export function getStatusHistory(): StatusHistory {
  processHistory ??= new StatusHistory();
  return processHistory;
}

export function attachStatusHistory(report: AdminStatusReport, store?: StatusHistoryStore): AdminStatusReportWithHistory;
export function attachStatusHistory(report: StatusReport, store?: StatusHistoryStore): StatusReportWithHistory;
export function attachStatusHistory(
  report: StatusReport,
  store: StatusHistoryStore = getStatusHistory()
): StatusReportWithHistory {
  return { ...report, history: store.prior() };
}
