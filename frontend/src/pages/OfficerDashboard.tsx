import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CalendarDays, Calendar, User, LogOut, Clock, 
  ArrowLeftRight, FileText, ChevronRight, CheckCircle2,
  AlertCircle, Loader2, Filter, Info, Heart
} from "lucide-react";
import {
  fetchMySchedule, fetchAvailableMonths,
  fetchLeaveRequests, submitLeave, cancelLeave,
  fetchSwaps, submitSwap,
  fetchPreferences, submitPreferences, deletePreference,
  claimSwap, fetchAnalytics, api,
  type UserSession, type LeaveReq, type SwapReq, type ShiftPref,
} from "../services/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import SterlingLogo from "../components/SterlingLogo";
import NotificationBell from "../components/NotificationBell";
import ChatPanel from "../components/ChatPanel";
import toast from "react-hot-toast";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const SHIFT_COLORS: Record<string, string> = {
  Morning:    "bg-yellow-100 text-yellow-800 border border-yellow-200",
  Night:      "bg-blue-100 text-blue-800 border border-blue-200",
  "12AM-7AM": "bg-indigo-100 text-indigo-800 border border-indigo-200",
  Off:        "bg-gray-100 text-gray-400 border border-gray-200",
  Leave:      "bg-orange-100 text-orange-700 border border-orange-200",
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pending: "bg-yellow-50 text-yellow-600 border-yellow-100",
    approved: "bg-green-50 text-green-600 border-green-100",
    rejected: "bg-red-50 text-red-600 border-red-100",
    accepted: "bg-blue-50 text-blue-600 border-blue-100",
    cancelled: "bg-gray-50 text-gray-400 border-gray-100",
    open: "bg-purple-50 text-purple-600 border-purple-100"
  };
  return map[s] || "bg-gray-50 text-gray-400 border-gray-100";
};

type Tab = "schedule" | "leave" | "swaps" | "preferences" | "analytics";
type Props = { session: UserSession; onLogout: () => void };

export default function OfficerDashboard({ session, onLogout }: Props) {
  const today = new Date();
  const [year,         setYear]         = useState(today.getFullYear());
  const [month,        setMonth]        = useState(today.getMonth() + 1);
  const [schedule,     setSchedule]     = useState<any>(null);
  const [availM,       setAvailM]       = useState<any[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [activeTab,    setActiveTab]    = useState<Tab>("schedule");
  const [leaveReqs,    setLeaveReqs]    = useState<LeaveReq[]>([]);
  const [leaveStart,   setLeaveStart]   = useState("");
  const [leaveEnd,     setLeaveEnd]     = useState("");
  const [leaveReason,  setLeaveReason]  = useState("");
  const [leaveMsg,     setLeaveMsg]     = useState("");
  const [leaveSaving,  setLeaveSaving]  = useState(false);
  const [showLeave,    setShowLeave]    = useState(false);
  const [swaps,        setSwaps]        = useState<SwapReq[]>([]);
  const [swapTarget,   setSwapTarget]   = useState("");
  const [swapMyDate,   setSwapMyDate]   = useState("");
  const [swapTheirDate,setSwapTheirDate]= useState("");
  const [swapReason,   setSwapReason]   = useState("");
  const [swapMsg,      setSwapMsg]      = useState("");
  const [swapSaving,   setSwapSaving]   = useState(false);
  const [showSwap,     setShowSwap]     = useState(false);
  // Preferences state
  const [prefs,        setPrefs]        = useState<ShiftPref[]>([]);
  const [prefDates,    setPrefDates]    = useState<string[]>([]);
  const [prefSaving,   setPrefSaving]   = useState(false);
  const [prefMsg,      setPrefMsg]      = useState("");
  const [analytics,    setAnalytics]    = useState<any>(null);
  const nextMonth = today.getMonth() === 11 ? 1 : today.getMonth() + 2;
  const nextMonthYear = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
  const daysInNextMonth = new Date(nextMonthYear, nextMonth, 0).getDate();

  useEffect(() => { fetchAvailableMonths().then(setAvailM).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true); setError("");
    fetchMySchedule(year, month)
      .then(setSchedule)
      .catch((e) => setError(e.response?.data?.detail ?? "Could not load schedule."))
      .finally(() => setLoading(false));
  }, [year, month]);
  useEffect(() => {
    if (activeTab === "leave") fetchLeaveRequests().then(setLeaveReqs).catch(() => {});
    if (activeTab === "swaps") fetchSwaps().then(setSwaps).catch(() => {});
    if (activeTab === "preferences") fetchPreferences(nextMonthYear, nextMonth).then(setPrefs).catch(() => {});
    if (activeTab === "analytics") fetchAnalytics({year, month}).then(setAnalytics).catch(() => {});
  }, [activeTab, year, month]);

  const handlePrefSubmit = async () => {
    if (prefDates.length === 0) { setPrefMsg("⚠️ Select at least one date."); return; }
    setPrefSaving(true); setPrefMsg("");
    try {
      await submitPreferences({ year: nextMonthYear, month: nextMonth, preferred_off_dates: prefDates });
      setPrefMsg(""); setPrefDates([]);
      toast.success("Preferences saved!");
      fetchPreferences(nextMonthYear, nextMonth).then(setPrefs).catch(() => {});
    } catch (e: any) {
      setPrefMsg("⚠️ " + (e.response?.data?.detail ?? "Failed."));
    } finally { setPrefSaving(false); }
  };

  const togglePrefDate = (dateStr: string) => {
    setPrefDates(prev => prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : prev.length >= 10 ? prev : [...prev, dateStr]);
  };

  const myName = schedule?.officer_name || "";

  const handleExportCalendar = async () => {
    try {
      const res = await api.get(`/api/calendar/?year=${year}&month=${month}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `schedule_${year}_${month}.ics`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      toast.success("Calendar exported!");
    } catch (e: any) {
      toast.error("Failed to export calendar. Make sure the schedule is published.");
    }
  };

  const handleLeave = async () => {
    if (!leaveStart || !leaveEnd) { setLeaveMsg("⚠️ Select dates."); return; }
    setLeaveSaving(true); setLeaveMsg("");
    try {
      await submitLeave(leaveStart, leaveEnd, leaveReason || undefined);
      setLeaveMsg("✅ Leave request submitted. Your team lead will review it.");
      setLeaveStart(""); setLeaveEnd(""); setLeaveReason(""); setShowLeave(false);
      fetchLeaveRequests().then(setLeaveReqs).catch(() => {});
    } catch (e: any) {
      setLeaveMsg("⚠️ " + (e.response?.data?.detail ?? "Failed."));
    } finally { setLeaveSaving(false); }
  };

  const handleSwap = async () => {
    if (!swapTarget || !swapMyDate || !swapTheirDate) { setSwapMsg("⚠️ Fill all fields."); return; }
    setSwapSaving(true); setSwapMsg("");
    try {
      await submitSwap({ target_name: swapTarget, requester_date: swapMyDate, target_date: swapTheirDate, reason: swapReason || undefined, schedule_id: schedule?.schedule_id });
      setSwapMsg("✅ Swap request submitted. Your team lead will review it.");
      setSwapTarget(""); setSwapMyDate(""); setSwapTheirDate(""); setSwapReason(""); setShowSwap(false);
      fetchSwaps().then(setSwaps).catch(() => {});
    } catch (e: any) {
      setSwapMsg("⚠️ " + (e.response?.data?.detail ?? "Failed."));
    } finally { setSwapSaving(false); }
  };

  const allOfficers: string[] = schedule?.all_rows
    ? [...new Set<string>(
        schedule.all_rows.flatMap((r: any) =>
          ["Morning (7AM - 5PM)", "Night (5PM - 12AM)", "Off"].flatMap((col: string) =>
            (r[col] ?? "").split(", ").map((e: string) => e.replace(" (Leave)", "").trim()).filter(Boolean)
          )
        )
      )].filter((n) => n !== myName)
    : [];

  const stats = schedule?.stats;

  const TABS: { key: Tab; label: string }[] = [
    { key: "schedule",    label: "📋 My Schedule" },
    { key: "leave",       label: "📅 Leave" },
    { key: "swaps",       label: "🔄 Swaps" },
    { key: "preferences", label: "💜 Preferences" },
    { key: "analytics",   label: "📊 Analytics" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-['Outfit',sans-serif]">
      {/* ── TOP NAVIGATION ── */}
      <nav className="sticky top-0 z-50 glass-nav border-b border-white/20 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SterlingLogo size="sm" />
            <div className="h-8 w-[1px] bg-gray-200 hidden sm:block"></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7b1e3a]">Officer Portal</p>
              <p className="text-xs font-bold text-gray-500">{session.team_name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Welcome back</p>
              <p className="text-sm font-bold text-gray-900">{session.display_name || myName}</p>
            </div>
            
            <div className="flex items-center gap-2">
              <NotificationBell />
              <div className="h-6 w-[1px] bg-gray-200 hidden sm:block"></div>
              <button onClick={onLogout} 
                className="flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-red-50 text-red-500 rounded-xl transition-all font-bold text-xs border border-red-100/50 shadow-sm">
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8 animate-fade-in">
        
        {/* ── CONTROLS & STATS ── */}
        <div className="flex flex-col md:flex-row gap-6 items-stretch">
          {/* Period Selector */}
          <div className="glass-card p-6 flex-1 flex items-center gap-4">
            <div className="p-3 bg-[#7b1e3a]/10 rounded-2xl text-[#7b1e3a]">
              <Calendar size={20} />
            </div>
            <div className="flex gap-4 items-center flex-1">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Period</label>
                <div className="flex gap-2">
                  <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                    className="input-field py-2">
                    {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                  </select>
                  <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
                    className="input-field py-2 w-24 text-center" />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-3 flex-1 overflow-x-auto pb-2 custom-scrollbar">
            {[
              { label: "Mornings", value: stats?.morning??0, icon: <Clock size={14} />, color: "text-yellow-600", bg: "bg-yellow-50" },
              { label: "Nights", value: stats?.night??0, icon: <Clock size={14} />, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Off", value: stats?.off??0, icon: <CalendarDays size={14} />, color: "text-gray-500", bg: "bg-gray-50" },
            ].map((s,i) => (
              <div key={i} className={`glass-card p-4 min-w-[100px] flex-1 flex flex-col items-center justify-center text-center`}>
                <div className={`p-2 rounded-lg ${s.bg} ${s.color} mb-2`}>{s.icon}</div>
                <p className="text-xl font-black text-gray-800">{s.value}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} 
            className="p-4 bg-red-50/80 backdrop-blur border border-red-200 rounded-2xl flex items-center gap-3">
            <AlertCircle className="text-red-500" size={18} />
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </motion.div>
        )}

        {/* ── MAIN TABS ── */}
        <div className="glass-card overflow-hidden">
          <div className="flex border-b border-gray-100 bg-gray-50/50 p-1.5 gap-1.5">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${
                  activeTab === t.key 
                    ? "bg-white text-[#7b1e3a] shadow-sm ring-1 ring-black/5 font-bold" 
                    : "text-gray-400 hover:text-gray-600 hover:bg-white/50"
                }`}>
                <span className="text-xs uppercase tracking-widest">{t.label.split(" ").pop()}</span>
              </button>
            ))}
          </div>

          <div className="p-8">
            <AnimatePresence mode="wait">
              {/* ── SCHEDULE TAB ── */}
              {activeTab === "schedule" && (
                <motion.div key="schedule" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-6">
                  {loading ? (
                    <div className="py-20 flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-[#7b1e3a]" size={32} />
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading Roster...</p>
                    </div>
                  ) : !schedule?.schedule_exists ? (
                    <div className="py-20 text-center flex flex-col items-center">
                      <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                        <CalendarDays size={32} className="text-gray-300" />
                      </div>
                      <h4 className="font-bold text-gray-800 mb-1">No Schedule Published</h4>
                      <p className="text-xs text-gray-400 font-medium">Your team lead hasn't finalized the roster for this period.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-gray-900">{MONTHS[month-1]} {year}</h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Team Deployment Plan</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={handleExportCalendar} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold uppercase tracking-widest ring-1 ring-purple-200 hover:bg-purple-200 transition">
                            📅 Export .ics
                          </button>
                          <div className="flex items-center gap-2 px-3 py-1 bg-[#7b1e3a]/10 text-[#7b1e3a] rounded-full text-[10px] font-bold uppercase tracking-widest ring-1 ring-[#7b1e3a]/20">
                            <User size={10} /> Your Shifts
                          </div>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white/40 shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-gray-50/50">
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Date</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Morning (7AM-5PM)</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Night (5PM-12AM)</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Off / Leave</th>
                              </tr>
                            </thead>
                            <tbody>
                              {schedule.all_rows.map((row: any, i: number) => {
                                const isWeekend = row.Day === "Saturday" || row.Day === "Sunday";
                                const renderCell = (cell: string, shift: string) => {
                                  if (!cell) return null;
                                  return cell.split(", ").map((entry: string, j: number) => {
                                    const isLeave = entry.includes("(Leave)");
                                    const name = entry.replace(" (Leave)", "").trim();
                                    const isMe = name === myName;
                                    return (
                                      <span key={j} className={`inline-block px-2.5 py-1 rounded-xl mr-2 mb-1 text-[10px] font-bold shadow-sm transition-all ${
                                        isMe 
                                          ? "bg-[#7b1e3a] text-white ring-2 ring-[#7b1e3a]/20 scale-105" 
                                          : isLeave 
                                            ? "bg-orange-100 text-orange-700 ring-1 ring-orange-200" 
                                            : shift === "morning" 
                                              ? "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200"
                                              : shift === "night"
                                                ? "bg-blue-100 text-blue-800 ring-1 ring-blue-200"
                                                : "bg-gray-100 text-gray-400 ring-1 ring-gray-200"
                                      }`}>
                                        {name}{isMe ? " ★" : ""}
                                      </span>
                                    );
                                  });
                                };
                                return (
                                  <tr key={i} className={`group hover:bg-[#7b1e3a]/[0.02] transition-colors ${isWeekend ? "bg-red-50/20" : ""}`}>
                                    <td className="px-6 py-4 border-b border-gray-50">
                                      <div className="flex items-center gap-3">
                                        <p className="text-xs font-black text-gray-800">{row.Date}</p>
                                        <p className={`text-[10px] font-bold uppercase tracking-tighter ${isWeekend ? "text-[#7b1e3a]" : "text-gray-400"}`}>{row.Day.slice(0,3)}</p>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 border-b border-gray-50">{renderCell(row["Morning (7AM - 5PM)"], "morning")}</td>
                                    <td className="px-6 py-4 border-b border-gray-50">{renderCell(row["Night (5PM - 12AM)"], "night")}</td>
                                    <td className="px-6 py-4 border-b border-gray-50">{renderCell(row.Off, "off")}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── LEAVE TAB ── */}
              {activeTab === "leave" && (
                <motion.div key="leave" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900">Leave Requests</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Absence Management</p>
                    </div>
                    {!showLeave && (
                      <button onClick={() => setShowLeave(true)} className="btn-primary py-2 px-5 text-xs">
                        New Request
                      </button>
                    )}
                  </div>

                  {showLeave && (
                    <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} 
                      className="bg-white/60 backdrop-blur-xl border border-gray-200 rounded-3xl p-8 shadow-2xl space-y-6 max-w-lg mx-auto">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 bg-orange-100 rounded-2xl text-orange-600"><CalendarDays size={20} /></div>
                        <h4 className="font-bold text-gray-800 text-lg">Request Leave</h4>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Start Date</label>
                          <input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">End Date</label>
                          <input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="input-field" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Reason (Optional)</label>
                        <textarea value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="e.g. Vacation, Medical..." rows={3} className="input-field resize-none py-3" />
                      </div>

                      <div className="flex gap-4 pt-4">
                        <button onClick={handleLeave} disabled={leaveSaving} className="btn-primary flex-1">
                          {leaveSaving ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Submit Request"}
                        </button>
                        <button onClick={() => setShowLeave(false)} className="btn-secondary px-8">Cancel</button>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid gap-4">
                    {leaveReqs.length === 0 && !showLeave && (
                      <div className="py-12 text-center bg-gray-50/30 rounded-3xl border border-dashed border-gray-200">
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No active requests</p>
                      </div>
                    )}
                    {leaveReqs.map((r) => (
                      <div key={r.id} className="group bg-white/50 backdrop-blur-sm border border-gray-100 hover:border-[#7b1e3a]/20 rounded-2xl p-6 transition-all hover:shadow-md">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex flex-col items-center justify-center">
                              <p className="text-[10px] font-black text-[#7b1e3a] uppercase">{new Date(r.start_date).toLocaleString('default', { month: 'short' })}</p>
                              <p className="text-lg font-black text-gray-800 leading-none">{new Date(r.start_date).getDate()}</p>
                            </div>
                            <div className="h-8 w-[1px] bg-gray-100"></div>
                            <div>
                              <p className="text-sm font-bold text-gray-800">{new Date(r.start_date).toLocaleDateString()} — {new Date(r.end_date).toLocaleDateString()}</p>
                              {r.reason && <p className="text-xs text-gray-400 italic mt-1">"{r.reason}"</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${statusBadge(r.status)}`}>
                              {r.status}
                            </span>
                            {r.status === "pending" && (
                              <button onClick={async () => { await cancelLeave(r.id); fetchLeaveRequests().then(setLeaveReqs); toast.success("Cancelled"); }}
                                className="p-2 text-gray-300 hover:text-red-500 transition-colors">✕</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── SWAPS TAB ── */}
              {activeTab === "swaps" && (
                <motion.div key="swaps" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900">Shift Swaps</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Team Coordination</p>
                    </div>
                    {!showSwap && (
                      <button onClick={() => setShowSwap(true)} className="btn-primary py-2 px-5 text-xs">
                        Request Swap
                      </button>
                    )}
                  </div>

                  {showSwap && (
                    <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} 
                      className="bg-white/60 backdrop-blur-xl border border-gray-200 rounded-3xl p-8 shadow-2xl space-y-6 max-w-lg mx-auto">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 bg-blue-100 rounded-2xl text-blue-600"><ArrowLeftRight size={20} /></div>
                        <h4 className="font-bold text-gray-800 text-lg">Shift Swap</h4>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Swap With</label>
                          <select value={swapTarget} onChange={(e) => setSwapTarget(e.target.value)} className="input-field">
                            <option value="">Select an officer...</option>
                            <option value="Open">Open Swap (Public Board)</option>
                            {allOfficers.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">My Shift Date</label>
                            <input type="date" value={swapMyDate} onChange={(e) => setSwapMyDate(e.target.value)} className="input-field" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Their Shift Date</label>
                            <input type="date" value={swapTheirDate} onChange={(e) => setSwapTheirDate(e.target.value)} className="input-field" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Reason</label>
                          <input value={swapReason} onChange={(e) => setSwapReason(e.target.value)} placeholder="Why the swap?" className="input-field" />
                        </div>
                      </div>

                      <div className="flex gap-4 pt-4">
                        <button onClick={handleSwap} disabled={swapSaving} className="btn-primary flex-1">
                          {swapSaving ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Send Request"}
                        </button>
                        <button onClick={() => setShowSwap(false)} className="btn-secondary px-8">Cancel</button>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid gap-4">
                    {swaps.length === 0 && !showSwap && (
                      <div className="py-12 text-center bg-gray-50/30 rounded-3xl border border-dashed border-gray-200">
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No active swaps</p>
                      </div>
                    )}
                    {swaps.map((s) => (
                      <div key={s.id} className="bg-white/50 border border-gray-100 rounded-2xl p-6 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-6">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-full bg-slate-100 border border-white shadow-sm flex items-center justify-center font-bold text-[#7b1e3a]">{s.requester_name[0]}</div>
                              <div className="w-8 h-[1px] bg-gray-200"></div>
                              <div className="w-10 h-10 rounded-full bg-blue-50 border border-white shadow-sm flex items-center justify-center font-bold text-blue-600">{s.target_name[0]}</div>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-800">{s.requester_name} ↔ {s.target_name}</p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{s.requester_date} / {s.target_date}</p>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusBadge(s.status)}`}>
                              {s.status}
                            </span>
                            {s.status === "open" && s.requester_name !== myName && (
                              <button onClick={async () => {
                                try {
                                  await claimSwap(s.id);
                                  toast.success("Swap claimed! Waiting for Team Lead approval.");
                                  fetchSwaps().then(setSwaps);
                                } catch (e: any) {
                                  toast.error(e.response?.data?.detail || "Failed to claim swap");
                                }
                              }} className="ml-3 btn-primary py-1 px-3 text-[10px]">
                                Claim Swap
                              </button>
                            )}
                          </div>
                        </div>
                        {s.reason && (
                          <div className="mt-4 p-3 bg-gray-50/50 rounded-xl flex items-start gap-3">
                            <Info size={14} className="text-gray-400 mt-0.5" />
                            <p className="text-xs text-gray-500 font-medium italic">"{s.reason}"</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
              
              {/* ── ANALYTICS TAB ── */}
              {activeTab === "analytics" && (
                <motion.div key="analytics" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-6">
                  {analytics ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          {label:"Officers",value:analytics.current?.summary?.total_officers??0,color:"bg-purple-50 text-purple-800"},
                          {label:"Avg Morning",value:analytics.current?.summary?.avg_morning??0,color:"bg-yellow-50 text-yellow-800"},
                          {label:"Avg Night",value:analytics.current?.summary?.avg_night??0,color:"bg-blue-50 text-blue-800"},
                          {label:"Avg Hours",value:`${analytics.current?.summary?.avg_hours??0}h`,color:"bg-teal-50 text-teal-800"},
                        ].map(s=>(
                          <div key={s.label} className={`rounded-xl p-4 border border-gray-200 ${s.color}`}>
                            <p className="text-xs font-medium opacity-70">{s.label}</p>
                            <p className="text-2xl font-bold mt-0.5">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {analytics.fairness&&(
                          <div className={`p-4 rounded-xl border ${analytics.fairness.score>=75?"bg-green-50 border-green-200 text-green-800":analytics.fairness.score>=50?"bg-yellow-50 border-yellow-200 text-yellow-800":"bg-red-50 border-red-200 text-red-800"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-semibold text-sm">Equity Score — {analytics.fairness.label}</p>
                                <p className="text-xs opacity-80 mt-0.5">{analytics.fairness.detail}</p>
                              </div>
                              <div className="text-2xl font-bold">{analytics.fairness.score}</div>
                            </div>
                            <div className="bg-white bg-opacity-50 rounded-full h-1.5 overflow-hidden">
                              <div className="h-1.5 rounded-full transition-all duration-1000" style={{width:`${analytics.fairness.score}%`,background:analytics.fairness.score>=75?"#16a34a":analytics.fairness.score>=50?"#d97706":"#dc2626"}} />
                            </div>
                          </div>
                        )}
                        {analytics.fatigue&&(
                          <div className={`p-4 rounded-xl border ${analytics.fatigue.score>=70?"bg-red-50 border-red-200 text-red-800":analytics.fatigue.score>=40?"bg-yellow-50 border-yellow-200 text-yellow-800":"bg-green-50 border-green-200 text-green-800"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-semibold text-sm">Fatigue Risk — {analytics.fatigue.label}</p>
                                <p className="text-xs opacity-80 mt-0.5">{analytics.fatigue.detail}</p>
                              </div>
                              <div className="text-2xl font-bold">{analytics.fatigue.score}</div>
                            </div>
                            <div className="bg-white bg-opacity-50 rounded-full h-1.5 overflow-hidden">
                              <div className="h-1.5 rounded-full transition-all duration-1000" style={{width:`${analytics.fatigue.score}%`,background:analytics.fatigue.score>=70?"#dc2626":analytics.fatigue.score>=40?"#d97706":"#16a34a"}} />
                            </div>
                          </div>
                        )}
                        {analytics.satisfaction&&(
                          <div className={`p-4 rounded-xl border ${analytics.satisfaction.score>=80?"bg-green-50 border-green-200 text-green-800":analytics.satisfaction.score>=50?"bg-yellow-50 border-yellow-200 text-yellow-800":"bg-red-50 border-red-200 text-red-800"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-semibold text-sm">Satisfaction — {analytics.satisfaction.label}</p>
                                <p className="text-xs opacity-80 mt-0.5">{analytics.satisfaction.detail}</p>
                              </div>
                              <div className="text-2xl font-bold">{analytics.satisfaction.score}%</div>
                            </div>
                            <div className="bg-white bg-opacity-50 rounded-full h-1.5 overflow-hidden">
                              <div className="h-1.5 rounded-full transition-all duration-1000" style={{width:`${analytics.satisfaction.score}%`,background:analytics.satisfaction.score>=80?"#16a34a":analytics.satisfaction.score>=50?"#d97706":"#dc2626"}} />
                            </div>
                          </div>
                        )}
                      </div>
                      {(analytics.trend??[]).filter((t:any)=>t.summary?.total_officers>0).length>0&&(
                        <div>
                          <p className="text-sm font-bold text-gray-700 mb-3">6-Month Trend</p>
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={analytics.trend} margin={{top:5,right:10,left:-10,bottom:5}}>
                              <XAxis dataKey="label" tick={{fontSize:10}} />
                              <YAxis tick={{fontSize:11}} />
                              <Tooltip contentStyle={{fontSize:12,borderRadius:8}} />
                              <Legend wrapperStyle={{fontSize:12}} />
                              <Line type="monotone" dataKey="summary.avg_morning" name="Avg Morning" stroke="#f59e0b" strokeWidth={2} dot={{r:4}} />
                              <Line type="monotone" dataKey="summary.avg_night"   name="Avg Night"   stroke="#3b82f6" strokeWidth={2} dot={{r:4}} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-20 flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-[#7b1e3a]" size={32} />
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading Analytics...</p>
                    </div>
                  )}
                </motion.div>
              )}

          {/* ── PREFERENCES TAB ── */}
          {activeTab === "preferences" && (
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="space-y-6">
              <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-50 rounded-xl">
                    <Heart size={20} className="text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Preferred Days Off</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                      {MONTHS[nextMonth - 1]} {nextMonthYear} · Select up to 10 dates
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mb-4 bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                  💡 Select dates you'd <strong>prefer</strong> not to work next month. The schedule generator will try its best to honor your preferences without breaking team coverage. These are soft requests, not guaranteed days off.
                </p>

                {prefMsg && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2 mb-4 font-medium">{prefMsg}</p>}

                <div className="grid grid-cols-7 gap-2 mb-6">
                  {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                    <div key={d} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest py-1">{d}</div>
                  ))}
                  {(() => {
                    const firstDay = new Date(nextMonthYear, nextMonth - 1, 1).getDay();
                    const offset = firstDay === 0 ? 6 : firstDay - 1;
                    const cells = [];
                    for (let i = 0; i < offset; i++) cells.push(<div key={`empty-${i}`} />);
                    for (let day = 1; day <= daysInNextMonth; day++) {
                      const dateStr = `${nextMonthYear}-${String(nextMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                      const isSelected = prefDates.includes(dateStr);
                      const isWeekend = new Date(nextMonthYear, nextMonth - 1, day).getDay() % 6 === 0;
                      cells.push(
                        <button key={day} type="button" onClick={() => togglePrefDate(dateStr)}
                          className={`relative p-2 rounded-xl text-sm font-bold transition-all ${
                            isSelected
                              ? "bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-200 scale-105"
                              : isWeekend
                              ? "bg-orange-50 text-orange-400 hover:bg-orange-100 border border-orange-100"
                              : "bg-white text-gray-700 hover:bg-purple-50 hover:border-purple-200 border border-gray-100"
                          }`}>
                          {day}
                          {isSelected && <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center shadow"><CheckCircle2 size={10} className="text-purple-600" /></span>}
                        </button>
                      );
                    }
                    return cells;
                  })()}
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400 font-medium">
                    {prefDates.length}/10 dates selected
                  </p>
                  <div className="flex gap-3">
                    {prefDates.length > 0 && (
                      <button onClick={() => setPrefDates([])} className="btn-secondary py-2 px-4 text-xs">Clear</button>
                    )}
                    <button onClick={handlePrefSubmit} disabled={prefSaving || prefDates.length === 0}
                      className="btn-primary py-2 px-6 text-xs flex items-center gap-2">
                      {prefSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Save Preferences
                    </button>
                  </div>
                </div>
              </div>

              {/* Existing preferences */}
              {prefs.length > 0 && (
                <div className="glass-card p-6">
                  <h4 className="font-bold text-sm text-gray-800 mb-4">Your Submitted Preferences</h4>
                  <div className="space-y-3">
                    {prefs.map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-white/50 border border-gray-100 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-xs font-bold text-gray-700">{MONTHS[p.month - 1]} {p.year}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {p.preferred_off_dates.map(d => (
                              <span key={d} className="text-[10px] font-bold px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full border border-purple-100">{d.split('-')[2]}</span>
                            ))}
                          </div>
                        </div>
                        <button onClick={async () => { await deletePreference(p.id); fetchPreferences(nextMonthYear, nextMonth).then(setPrefs); toast.success("Deleted"); }}
                          className="text-[10px] font-bold text-red-400 hover:text-red-600 transition uppercase">Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

            </AnimatePresence>
          </div>
        </div>
      </div>
      
      {/* ── FOOTER ── */}
      <footer className="max-w-4xl mx-auto px-6 py-10 text-center">
        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">Sterling Bank PLC · SMO Schedule Management v2.0</p>
      </footer>
      <ChatPanel session={session} />
    </div>
  );
}