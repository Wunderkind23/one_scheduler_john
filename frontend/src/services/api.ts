import axios from "axios";
import { API_BASE_URL } from "../config/env";

export const api = axios.create({ baseURL: API_BASE_URL });

// ── Send token with every request ─────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers["authorization"] = `Bearer ${token}`;
  }
  return config;
});

// ── Auto-logout on 401 ────────────────────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserSession {
  token: string;
  email: string;
  display_name: string;
  role: "teamlead" | "officer" | "no_team";
  team_id: number | null;
  team_name: string | null;
  is_superadmin: boolean;
};

export type Officer = {
  id:                   number;
  name:                 string;
  email:                string;
  unit?:                string;
  is_active:            boolean;
  is_teamlead?:         boolean;
  last_assigned_shift?: string;
};

export type LeaveReq = {
  id:            number;
  officer_name:  string;
  officer_email: string;
  start_date:    string;
  end_date:      string;
  reason?:       string;
  status:        string;
  reviewed_by?:  string;
  created_at:    string;
  reviewed_at?:  string;
};

export type SwapReq = {
  id:             number;
  requester_name: string;
  target_name:    string;
  requester_date: string;
  target_date:    string;
  reason?:        string;
  status:         string;
  resolved_by?:   string;
  created_at:     string;
  resolved_at?:   string;
};

export type LeaveRange = { start: Date | null; end: Date | null };

export type ShiftType = {
  name:        string;
  start_time?: string;
  end_time?:   string;
  count:       number;
  color?:      string;
};

export type ShiftModelRecord = {
  id:                   number;
  team_id:              number;
  unit_name:            string;
  shift_types:          ShiftType[];
  working_days:         string[] | null;
  max_concurrent_leave: number;
  night_continues:      boolean;
  no_night_before_leave: boolean;
};

// ── Aliases for backward compatibility with components ──
export type OfficerRecord = Officer;
export type LeaveReqRecord = LeaveReq;
export type SwapRequest = SwapReq;
export type ShiftTypeConfig = ShiftType;
export type HolidayRecord = any;
export type MyScheduleRow = any;
export type MyStats = any;
export type ShiftModelPayload = Omit<ShiftModelRecord, "id" | "team_id">;

// ── Auth ──────────────────────────────────────────────────────────────────────

export const login = async (email: string, password: string): Promise<UserSession> =>
  (await api.post("/api/admin/login", { email, password })).data;

export const getMe = async (): Promise<UserSession> =>
  (await api.get("/api/admin/me")).data;

// ── Teams ─────────────────────────────────────────────────────────────────────

export const createTeam = async (team_name: string, your_name: string) =>
  (await api.post("/api/teams/create", { team_name, your_name })).data;

export const getMyTeam = async () =>
  (await api.get("/api/teams/mine")).data;

export const getAvailableTeams = async () =>
  (await api.get("/api/teams/available")).data as Array<{ id: number; name: string }>;

export const joinTeam = async (team_id: number, your_name: string) =>
  (await api.post("/api/teams/join", { team_id, your_name })).data;

export const getTeamMembers = async () =>
  (await api.get("/api/teams/members")).data as Officer[];

// ── Officers ──────────────────────────────────────────────────────────────────

export const fetchOfficers = async () =>
  (await api.get("/api/officers/")).data as Officer[];

export const addOfficer = async (name: string, email: string) =>
  (await api.post("/api/officers/", { name, email })).data;

export const updateOfficer = async (id: number, name: string, email: string) =>
  (await api.put(`/api/officers/${id}`, { name, email })).data;

export const removeOfficer = async (id: number) =>
  (await api.delete(`/api/officers/${id}`)).data;

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a Date to YYYY-MM-DD using LOCAL time, not UTC.
 * Fixes the timezone shift bug where midnight Lagos time (UTC+1)
 * would roll back to the previous day in UTC.
 */
function toLocalDate(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Expand a date range into an array of YYYY-MM-DD strings.
 * Uses local time — no UTC conversion.
 * No automatic extension in either direction.
 * Monday-Friday leave = exactly those 5 days.
 * Monday-Monday leave = all 8 days including the weekend in between.
 */
export function expandDates(start: Date | null, end: Date | null): string[] {
  if (!start) return [];
  const dates: string[] = [];
  const cur = new Date(start);
  const fin = end ?? start;
  while (cur <= fin) {
    dates.push(toLocalDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── Schedules ─────────────────────────────────────────────────────────────────

export const previewSchedule = async (p: {
  year:            number;
  month:           number;
  leaveMap:        Record<string, LeaveRange>;
  shift_model_id?: number | null;
  reset_rotation?: boolean;
  no_night_before_leave?: boolean;
  use_ai?: boolean;
}) =>
  (await api.post("/api/schedules/preview", {
    year:           p.year,
    month:          p.month,
    leave_schedule: Object.entries(p.leaveMap).map(([officer, r]) => ({
      officer,
      dates: expandDates(r.start, r.end),
    })),
    shift_model_id: p.shift_model_id ?? undefined,
    reset_rotation: p.reset_rotation ?? false,
    no_night_before_leave: p.no_night_before_leave ?? false,
    use_ai: p.use_ai ?? false,
  })).data as {
    schedule:      any[];
    summary:       any[];
    next_offset:   number;
    officers_used: string[];
    warnings:      any[];
    holidays:      string[];
    leave_map:     Record<string, string[]>;
  };

export const saveSchedule = async (p: {
  year:            number;
  month:           number;
  data:            any[];
  rotation_offset: number;
}) => (await api.post("/api/schedules/save", p)).data;

export const fetchSchedules = async () =>
  (await api.get("/api/schedules/")).data;

export const fetchScheduleById = async (id: number) =>
  (await api.get(`/api/schedules/${id}`)).data;

// ── My schedule (officer view) ────────────────────────────────────────────────

export const fetchMySchedule = async (year?: number, month?: number) => {
  const p = new URLSearchParams();
  if (year)  p.set("year",  String(year));
  if (month) p.set("month", String(month));
  return (await api.get(`/api/my-schedule/?${p}`)).data;
};

export const fetchAvailableMonths = async () =>
  (await api.get("/api/my-schedule/available-months")).data as Array<{
    year: number; month: number;
  }>;

// ── Leave requests ────────────────────────────────────────────────────────────

export const fetchLeaveRequests = async (status?: string) => {
  const p = status ? `?status=${status}` : "";
  return (await api.get(`/api/leave-requests/${p}`)).data as LeaveReq[];
};

export const submitLeave = async (
  start_date: string,
  end_date:   string,
  reason?:    string,
) => (await api.post("/api/leave-requests/", { start_date, end_date, reason })).data;

export const reviewLeave = async (id: number, action: "approve" | "reject") =>
  (await api.put(`/api/leave-requests/${id}/review`, { action })).data;

export const cancelLeave = async (id: number) =>
  (await api.delete(`/api/leave-requests/${id}`)).data;

// ── Shift swaps ───────────────────────────────────────────────────────────────

export const fetchSwaps = async (status?: string) => {
  const p = status ? `?status=${status}` : "";
  return (await api.get(`/api/swaps/${p}`)).data as SwapReq[];
};

export const submitSwap = async (d: {
  target_name:    string;
  requester_date: string;
  target_date:    string;
  reason?:        string;
  schedule_id?:   number;
}) => (await api.post("/api/swaps/", d)).data;

export const resolveSwap = async (
  id:     number,
  action: "accept" | "reject" | "cancel",
) => (await api.put(`/api/swaps/${id}/resolve`, { action })).data;

// ── Emails ────────────────────────────────────────────────────────────────────

export const sendMonthlyEmails = async (scheduleId: number, force = false) =>
  (await api.post(`/api/emails/send-monthly/${scheduleId}?force=${force}`)).data;

// ── Shift models ──────────────────────────────────────────────────────────────

export const fetchShiftModels = async () =>
  (await api.get("/api/shift-models/")).data as ShiftModelRecord[];

export const createShiftModel = async (d: {
  unit_name:            string;
  shift_types:          ShiftType[];
  working_days?:        string[] | null;
  max_concurrent_leave: number;
  night_continues:      boolean;
  no_night_before_leave: boolean;
}) => (await api.post("/api/shift-models/", d)).data as ShiftModelRecord;

export const updateShiftModel = async (id: number, d: {
  unit_name:            string;
  shift_types:          ShiftType[];
  working_days?:        string[] | null;
  max_concurrent_leave: number;
  night_continues:      boolean;
  no_night_before_leave: boolean;
}) => (await api.put(`/api/shift-models/${id}`, d)).data as ShiftModelRecord;

export const deleteShiftModel = async (id: number) =>
  (await api.delete(`/api/shift-models/${id}`)).data;

// ── Holidays ──────────────────────────────────────────────────────────────────

export const fetchHolidays = async () =>
  (await api.get("/api/holidays/")).data;

export const addHoliday = async (d: {
  name:       string;
  month:      number;
  day:        number;
  recurring:  boolean;
  year?:      number;
}) => (await api.post("/api/holidays/", d)).data;

export const deleteHoliday = async (id: number) =>
  (await api.delete(`/api/holidays/${id}`)).data;

export const seedNigerianHolidays = async () =>
  (await api.post("/api/holidays/seed-nigerian")).data;

// ── Analytics ─────────────────────────────────────────────────────────────────

export const fetchAnalytics = async (p: {
  year?:        number;
  month?:       number;
  months_back?: number;
}) => {
  const params = new URLSearchParams();
  if (p.year)  params.set("year",        String(p.year));
  if (p.month) params.set("month",       String(p.month));
  params.set("months_back", String(p.months_back ?? 6));
  return (await api.get(`/api/analytics/?${params}`)).data;
};

// ── Settings ──────────────────────────────────────────────────────────────────

export const getSettings = async () =>
  (await api.get("/api/settings/")).data;

export const saveSettings = async (d: {
  send_day:          number;
  send_hour:         number;
  auto_generate_day: number;
}) => (await api.put("/api/settings/", d)).data;

// ── User Management (Missing in api.ts) ───────────────────────────────────────

export const listUsers   = async () => (await api.get("/api/teams/members")).data;
export const promoteUser = async (email: string) => (await api.post("/api/users/promote", { email })).data;
export const demoteUser  = async (email: string) => (await api.post("/api/users/demote",  { email })).data;

// ── Aliases for function names expected by components ─────────────────────────

export const createLeaveRequest = submitLeave;
export const createSwap = submitSwap;
export const reviewLeaveRequest = reviewLeave;
export const createOfficer = addOfficer;
export const deleteOfficer = removeOfficer;
export const createHoliday = addHoliday;

// ── Shift Preferences ─────────────────────────────────────────────────────────

export type ShiftPref = {
  id:                  number;
  team_id:             number;
  officer_id:          number;
  officer_name:        string;
  year:                number;
  month:               number;
  preferred_off_dates: string[];
  created_at:          string;
};

export const fetchPreferences = async (year?: number, month?: number): Promise<ShiftPref[]> => {
  const params: any = {};
  if (year)  params.year  = year;
  if (month) params.month = month;
  return (await api.get("/api/preferences/", { params })).data;
};

export const submitPreferences = async (data: {
  year:                number;
  month:               number;
  preferred_off_dates: string[];
}) => (await api.post("/api/preferences/", data)).data;

export const deletePreference = async (id: number) =>
  (await api.delete(`/api/preferences/${id}`)).data;

// ── Schedule Publishing & Auto-Draft ──────────────────────────────────────────

export const publishSchedule = async (scheduleId: number) =>
  (await api.put(`/api/schedules/${scheduleId}/publish`)).data;

export const triggerAutoDraft = async () =>
  (await api.post("/api/schedules/auto-draft")).data;

export const claimSwap = async (swapId: number) =>
  (await api.put(`/api/swaps/${swapId}/claim`)).data;

// ── Notifications ─────────────────────────────────────────────────────────────

export type AppNotification = {
  id: number;
  message: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
};

export const fetchNotifications = async () =>
  (await api.get("/api/notifications/")).data as AppNotification[];

export const markNotificationsRead = async () =>
  (await api.put("/api/notifications/mark-read")).data;

export default api;