import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import { 
  CalendarDays, Users, BarChart3, ArrowRight, Loader2, Settings, 
  Search, Plus, Filter, Download, Mail, CheckCircle2, AlertCircle 
} from "lucide-react";
import {
  fetchOfficers, addOfficer, updateOfficer, removeOfficer,
  previewSchedule, saveSchedule, fetchSchedules, sendMonthlyEmails,
  fetchLeaveRequests, reviewLeave, fetchSwaps, resolveSwap,
  fetchShiftModels, createShiftModel, deleteShiftModel,
  fetchHolidays, addHoliday, deleteHoliday, seedNigerianHolidays,
  fetchAnalytics, getSettings, saveSettings,
  publishSchedule, triggerAutoDraft,
  type UserSession, type Officer, type LeaveReq, type SwapReq, type LeaveRange,
} from "../services/api";
import toast from "react-hot-toast";
import SterlingLogo from "../components/SterlingLogo";
import NotificationBell from "../components/NotificationBell";
import ChatPanel from "../components/ChatPanel";

// ── Embedded ShiftModelForm ───────────────────────────────────────────────────
const ALL_DAYS    = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const COLORS      = ["#f59e0b","#3b82f6","#10b981","#f97316","#8b5cf6","#ef4444","#06b6d4","#84cc16"];
function uid()    { return Math.random().toString(36).slice(2,8); }

type ShiftRow = { _id:string; name:string; start_time:string; end_time:string; count:number; color:string };

function ShiftModelForm({ onSave, onCancel }: { onSave:(p:any)=>Promise<void>; onCancel:()=>void }) {
  const [patternText, setPatternText] = useState("Morning, Off, Morning, Off, Night, Off, Night, Off");
  const [modelName,   setModelName]   = useState("");
  const [shifts,      setShifts]      = useState<ShiftRow[]>([
    { _id: uid(), name: "Morning", start_time: "07:00", end_time: "17:00", count: 2, color: "#f59e0b" },
    { _id: uid(), name: "Night",   start_time: "17:00", end_time: "07:00", count: 2, color: "#3b82f6" },
  ]);
  const [days,        setDays]        = useState<string[]>([...ALL_DAYS]);
  const [allDays,     setAllDays]     = useState(true);
  const [maxLeave,    setMaxLeave]    = useState(1);
  const [nightCont,   setNightCont]   = useState(true);
  const [noNightBeforeLeave, setNoNightBeforeLeave] = useState(false);
  const [maxConsecutiveWorkdays, setMaxConsecutiveWorkdays] = useState(6);
  const [minRestHoursBetweenShifts, setMinRestHoursBetweenShifts] = useState(12);
  const [err,         setErr]         = useState("");
  const [saving,      setSaving]      = useState(false);

  const totalOfficers = shifts.reduce((sum, s) => sum + s.count, 0);

  const toggleDay = (day: string) => {
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    setDays(next); setAllDays(next.length === 7);
  };

  const addShift = () => setShifts(prev => [...prev, {
    _id: uid(), name: "", start_time: "08:00", end_time: "16:00",
    count: 2, color: COLORS[prev.length % COLORS.length],
  }]);

  const upd = (_id: string, field: keyof Omit<ShiftRow, "_id">, value: any) =>
    setShifts(prev => prev.map(s => s._id === _id ? { ...s, [field]: value } : s));

  const handleSave = async () => {
    setErr("");
    if (!modelName.trim())               { setErr("Enter a model name.");          return; }
    if (shifts.length === 0)             { setErr("Add at least one shift.");      return; }
    if (shifts.some(s=>!s.name.trim()))  { setErr("All shifts need a name.");      return; }
    if (days.length === 0)               { setErr("Select at least one day.");     return; }
    if (maxLeave < 1)                    { setErr("Max leave must be at least 1."); return; }
    
    // Parse pattern
    const pattern = patternText.split(",").map(s => s.trim()).filter(s => s.length > 0);
    if (pattern.length === 0) { setErr("Rotation pattern cannot be empty."); return; }

    setSaving(true);
    try {
      await onSave({
        unit_name:            modelName.trim(),
        shift_types:          shifts.map(({_id,...s}) => s),
        working_days:         allDays ? null : days,
        max_concurrent_leave: maxLeave,
        night_continues:      nightCont,
        no_night_before_leave: noNightBeforeLeave,
        rotation_pattern:     pattern,
        max_consecutive_workdays: maxConsecutiveWorkdays,
        min_rest_hours_between_shifts: minRestHoursBetweenShifts,
      });
    } catch (e:any) {
      setErr(e?.response?.data?.detail ?? e?.message ?? "Failed to save.");
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-6 space-y-6 mt-4 border-[#7b1e3a]/20">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold text-lg text-[#7b1e3a]">New Shift Model</h4>
          <p className="text-xs text-gray-500 mt-0.5">Customize your team's rotation logic</p>
        </div>
        <span className="text-xs bg-white/50 backdrop-blur px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 font-medium">
          {totalOfficers} officer{totalOfficers!==1?"s":""}/day
        </span>
      </div>

      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 animate-fade-in">⚠️ {err}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Name */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Model Name *</label>
            <input value={modelName} onChange={e=>setModelName(e.target.value)}
              placeholder="e.g. Alpha Team"
              className="input-field" />
          </div>

          {/* Working days */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Working Days *</label>
              <button type="button" onClick={()=>setDays(allDays?[...ALL_DAYS]:[])}
                className="text-[10px] text-[#7b1e3a] font-bold uppercase hover:opacity-70 transition">
                {allDays?"Clear All":"Select All"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map(day => (
                <button key={day} type="button" onClick={()=>toggleDay(day)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    days.includes(day)
                      ? "bg-[#7b1e3a] text-white border-[#7b1e3a] shadow-sm"
                      : "bg-white text-gray-500 border-gray-200 hover:border-[#7b1e3a]/30"
                  }`}>
                  {day.slice(0,3)}
                </button>
              ))}
            </div>
          </div>

          {/* Rotation Pattern */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Rotation Pattern (Comma separated) *</label>
            <textarea value={patternText} onChange={e=>setPatternText(e.target.value)}
              placeholder="Morning, Off, Morning, Off, Night, Off, Night, Off"
              rows={3}
              className="input-field resize-none text-xs font-mono" />
            <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
              Use shift names exactly as defined (e.g. Morning, Night) or "Off". 
              Officers will follow this sequence staggered by 1 day.
            </p>
          </div>
        </div>

        {/* Shifts */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Shift Types *</label>
            <button type="button" onClick={addShift}
              className="text-[10px] bg-green-50 text-green-700 px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-100 transition font-bold uppercase">
              + Add
            </button>
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {shifts.map((s, idx) => (
              <div key={s._id} className="bg-white/40 border border-gray-200 rounded-xl p-4 relative group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Shift {idx+1}</span>
                  {shifts.length > 1 && (
                    <button type="button" onClick={()=>setShifts(p=>p.filter(x=>x._id!==s._id))}
                      className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition">Remove</button>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <input value={s.name} onChange={e=>upd(s._id,"name",e.target.value)}
                      placeholder="Shift Name (e.g. Morning)"
                      className="w-full px-3 py-2 bg-white/60 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-[#7b1e3a]" />
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-[70px] shrink-0">
                      <label className="text-[10px] text-gray-400 font-bold uppercase ml-1 block mb-1">Staff</label>
                      <input type="number" min={1} value={s.count}
                        onChange={e=>upd(s._id,"count",Math.max(1,Number(e.target.value)))}
                        className="w-full px-2 py-2 bg-white/60 border border-gray-200 rounded-lg text-xs font-mono text-center" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-400 font-bold uppercase ml-1 block mb-1">Times</label>
                      <div className="flex items-center gap-1.5">
                        <input type="time" value={s.start_time} onChange={e=>upd(s._id,"start_time",e.target.value)}
                          className="flex-1 px-2 py-1.5 bg-white/60 border border-gray-200 rounded-lg text-[11px] font-mono tracking-tighter" />
                        <span className="text-gray-400 font-bold">-</span>
                        <input type="time" value={s.end_time} onChange={e=>upd(s._id,"end_time",e.target.value)}
                          className="flex-1 px-2 py-1.5 bg-white/60 border border-gray-200 rounded-lg text-[11px] font-mono tracking-tighter" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Leave Constraints</label>
            <div className="flex items-center gap-4">
              <input type="number" min={1} value={maxLeave}
                onChange={e=>setMaxLeave(Math.max(1,Number(e.target.value)))}
                className="w-24 input-field" />
              <p className="text-[10px] text-gray-400 leading-relaxed italic">Max officers allowed on leave per day.</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Max Consecutive Workdays</label>
            <div className="flex items-center gap-4">
              <input type="number" min={1} max={14} value={maxConsecutiveWorkdays}
                onChange={e=>setMaxConsecutiveWorkdays(Math.max(1,Number(e.target.value)))}
                className="w-24 input-field" />
              <p className="text-[10px] text-gray-400 leading-relaxed italic">Max consecutive workdays before a required off day.</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Min Rest Hours Between Shifts</label>
            <div className="flex items-center gap-4">
              <input type="number" min={0} max={48} value={minRestHoursBetweenShifts}
                onChange={e=>setMinRestHoursBetweenShifts(Math.max(0,Number(e.target.value)))}
                className="w-24 input-field" />
              <p className="text-[10px] text-gray-400 leading-relaxed italic">Minimum required hours of rest between consecutive shifts.</p>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input type="checkbox" checked={nightCont}
              onChange={e=>setNightCont(e.target.checked)} className="rounded-md border-gray-300 text-[#7b1e3a] focus:ring-[#7b1e3a]" />
            <span className="text-xs font-semibold text-gray-700 group-hover:text-[#7b1e3a] transition">Night shift continues to next day morning</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input type="checkbox" checked={noNightBeforeLeave}
              onChange={e=>setNoNightBeforeLeave(e.target.checked)} className="rounded-md border-gray-300 text-[#7b1e3a] focus:ring-[#7b1e3a]" />
            <span className="text-xs font-semibold text-gray-700 group-hover:text-[#7b1e3a] transition">No night shift before leave</span>
          </label>
        </div>

        <div className="flex items-end gap-3">
          <button type="button" onClick={handleSave} disabled={saving}
            className="btn-primary flex-1">
            {saving ? "Saving…" : "Save Model"}
          </button>
          <button type="button" onClick={onCancel}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const BAR_COLORS: Record<string,string> = { Morning:"#f59e0b", Night:"#3b82f6", Off:"#9ca3af", Leave:"#f97316" };

type MainTab = "schedule"|"analytics"|"team"|"settings";
type SubTab  = "view"|"print"|"swaps"|"holidays";
type Props   = { session:UserSession; onLogout:()=>void };

export default function TeamLeadDashboard({ session, onLogout }:Props) {
  const today = new Date();
  const [mainTab,       setMainTab]       = useState<MainTab>("schedule");
  const [subTab,        setSubTab]        = useState<SubTab>("view");
  const [year,          setYear]          = useState(today.getFullYear());
  const [month,         setMonth]         = useState(today.getMonth()+1);
  const [shiftModelId,  setShiftModelId]  = useState<number|null>(null);
  const [resetRot,      setResetRot]      = useState(false);
  const [useAI,         setUseAI]         = useState(false);
  const [noNightBeforeLeaveSMO, setNoNightBeforeLeaveSMO] = useState(false);
  const [officers,      setOfficers]      = useState<Officer[]>([]);
  const [leaveMap,      setLeaveMap]      = useState<Record<string,LeaveRange>>({});
  const [leaveOpen,     setLeaveOpen]     = useState(false);
  const [leaveOfficer,  setLeaveOfficer]  = useState<string|null>(null);
  const [shiftModels,   setShiftModels]   = useState<any[]>([]);
  const [showModelForm, setShowModelForm] = useState(false);
  const [preview,       setPreview]       = useState<any[]>([]);
  const [summary,       setSummary]       = useState<any[]>([]);
  const [nextOffset,    setNextOffset]    = useState(0);
  const [savedId,       setSavedId]       = useState<number|null>(null);
  const [officersUsed,  setOfficersUsed]  = useState<string[]>([]);
  const [warnings,      setWarnings]      = useState<any[]>([]);
  const [holidayDates,  setHolidayDates]  = useState<string[]>([]);
  const [pastSchedules, setPastSchedules] = useState<any[]>([]);
  const [leaveReqs,     setLeaveReqs]     = useState<LeaveReq[]>([]);
  const [swaps,         setSwaps]         = useState<SwapReq[]>([]);
  const [allHolidays,   setAllHolidays]   = useState<any[]>([]);
  const [analytics,     setAnalytics]     = useState<any>(null);
  const [settings,      setSettings]      = useState({ send_day:1, send_hour:8, auto_generate_day:25 });
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [msg,           setMsg]           = useState("");
  const [filterOfficer, setFilterOfficer] = useState("ALL");
  const [exportOpen,    setExportOpen]    = useState(false);
  const [showOfficerForm,  setShowOfficerForm]  = useState(false);
  const [editingOfficer,   setEditingOfficer]   = useState<Officer|null>(null);
  const [oName,  setOName]  = useState("");
  const [oEmail, setOEmail] = useState("");
  const [oSaving,setOSaving]= useState(false);
  const [oError, setOError] = useState("");
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [hName,  setHName]  = useState("");
  const [hMonth, setHMonth] = useState(1);
  const [hDay,   setHDay]   = useState(1);
  const [hRecurr,setHRecurr]= useState(true);
  const exportRef     = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const officerNames  = officers.map(o=>o.name);

  const showMsg = (m:string) => { setMsg(m); setTimeout(()=>setMsg(""),5000); };

  useEffect(()=>{ loadOfficers(); loadModels(); loadPast(); loadLeaveReqs(); loadSwaps(); loadSettings(); },[]);
  useEffect(()=>{
    if (mainTab==="analytics") loadAnalytics();
    if (mainTab==="team")      { loadLeaveReqs(); loadSwaps(); }
    if (subTab==="holidays")   loadHolidays();
  },[mainTab,subTab]);
  useEffect(()=>{
    setLeaveMap(prev=>{
      const next:Record<string,LeaveRange>={};
      officerNames.forEach(n=>{ next[n]=prev[n]??{start:null,end:null}; });
      return next;
    });
  },[officers]);
  useEffect(()=>{
    if (!exportOpen) return;
    const h=(e:MouseEvent)=>{ if(exportMenuRef.current&&!exportMenuRef.current.contains(e.target as Node)) setExportOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[exportOpen]);

  const loadOfficers  = async()=>{ try{ setOfficers(await fetchOfficers()); }catch{} };
  const loadModels    = async()=>{ try{ setShiftModels(await fetchShiftModels()); }catch{} };
  const loadPast      = async()=>{ try{ setPastSchedules(await fetchSchedules()); }catch{} };
  const loadLeaveReqs = async()=>{ try{ setLeaveReqs(await fetchLeaveRequests()); }catch{} };
  const loadSwaps     = async()=>{ try{ setSwaps(await fetchSwaps()); }catch{} };
  const loadHolidays  = async()=>{ try{ setAllHolidays(await fetchHolidays()); }catch{} };
  const loadAnalytics = async()=>{ try{ setAnalytics(await fetchAnalytics({year,month})); }catch{} };
  const loadSettings  = async()=>{ try{ setSettings(await getSettings()); }catch{} };

  const handleGenerate = async()=>{
    setLoading(true); setError(""); setPreview([]); setSummary([]);
    setSavedId(null); setOfficersUsed([]); setWarnings([]); setHolidayDates([]);
    try {
      const res = await previewSchedule({ year, month, leaveMap, shift_model_id:shiftModelId, reset_rotation:resetRot, no_night_before_leave:noNightBeforeLeaveSMO, use_ai: useAI });
      setPreview(res.schedule); setSummary(res.summary); setNextOffset(res.next_offset);
      setOfficersUsed(res.officers_used??[]); setWarnings(res.warnings??[]); setHolidayDates(res.holidays??[]);
    } catch(e:any){ setError(e.response?.data?.detail??"Failed to generate."); }
    finally{ setLoading(false); }
  };

  const handleSave = async()=>{
    if (!preview.length) return;
    try {
      const res = await saveSchedule({ year, month, data:preview, rotation_offset:nextOffset });
      setSavedId(res.id); showMsg("✅ Schedule saved!"); await loadPast();
    } catch(e:any){ setError(e.response?.data?.detail??"Failed to save."); }
  };

  const handleSendEmails = async(id:number, force=false)=>{
    try { await sendMonthlyEmails(id,force); showMsg(force?"📧 Force-resend queued.":"📧 Emails queued."); await loadPast(); }
    catch(e:any){ setError(e.response?.data?.detail??"Failed."); }
  };

  const handleOfficerSave = async()=>{
    if (!oName.trim())  { setOError("Name required."); return; }
    if (!oEmail.trim() || !oEmail.includes("@")) { setOError("Valid email required."); return; }
    setOSaving(true); setOError("");
    try {
      if (editingOfficer) await updateOfficer(editingOfficer.id, oName, oEmail);
      else await addOfficer(oName, oEmail);
      await loadOfficers();
      setShowOfficerForm(false); setOName(""); setOEmail(""); setEditingOfficer(null);
    } catch(e:any){ setOError(e.response?.data?.detail??"Failed."); }
    finally{ setOSaving(false); }
  };

  const handleOfficerRemove = async(o:Officer)=>{
    if (!confirm(`Remove ${o.name}?`)) return;
    try { await removeOfficer(o.id); await loadOfficers(); }
    catch(e:any){ setError(e.response?.data?.detail??"Failed."); }
  };

  const handleLeaveReview = async(id:number, action:"approve"|"reject")=>{
    try { await reviewLeave(id,action); showMsg(`✅ Request ${action}d.`); await loadLeaveReqs(); }
    catch(e:any){ setError(e.response?.data?.detail??"Failed."); }
  };

  const handleSwapResolve = async(id:number, action:"accept"|"reject"|"cancel")=>{
    try { await resolveSwap(id,action); showMsg(`✅ Swap ${action}ed.`); await loadSwaps(); }
    catch(e:any){ setError(e.response?.data?.detail??"Failed."); }
  };

  const handleHolidayAdd = async()=>{
    if (!hName.trim()) return;
    try {
      await addHoliday({ name:hName, month:hMonth, day:hDay, recurring:hRecurr });
      setHName(""); setHMonth(1); setHDay(1); setHRecurr(true);
      setShowHolidayForm(false); await loadHolidays();
    } catch(e:any){ setError(e.response?.data?.detail??"Failed."); }
  };

  const exportExcel=()=>{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),"Summary");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(preview),"Schedule");
    saveAs(new Blob([XLSX.write(wb,{bookType:"xlsx",type:"array"})])
      ,`SMO_${MONTHS[month-1]}_${year}.xlsx`);
    setExportOpen(false);
  };

  const exportCSV=()=>{
    const lines=[`SMO — ${MONTHS[month-1]} ${year}`,"","SUMMARY"];
    lines.push(Object.keys(summary[0]??{}).map(k=>`"${k}"`).join(","));
    summary.forEach(r=>lines.push(Object.values(r).map(v=>`"${v}"`).join(",")));
    lines.push("","SCHEDULE");
    lines.push(Object.keys(preview[0]??{}).map(k=>`"${k}"`).join(","));
    preview.forEach(r=>lines.push(Object.values(r).map(v=>`"${v}"`).join(",")));
    saveAs(new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8;"}),`SMO_${MONTHS[month-1]}_${year}.csv`);
    setExportOpen(false);
  };

  const exportPDF=()=>{
    if (!exportRef.current) return;
    const win=window.open("","","height=700,width=1100");
    if (!win) return;
    win.document.write(`<html><head><title>SMO</title><style>body{font-family:Arial;margin:20px;font-size:11px}h2{color:#7b1e3a}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ccc;padding:4px 6px;font-size:10px}th{background:#7b1e3a;color:white}tr:nth-child(even){background:#f9f9f9}</style></head><body>`);
    win.document.write(`<h2>SMO Schedule — ${MONTHS[month-1]} ${year} · ${session.team_name}</h2>`);
    win.document.write(exportRef.current.innerHTML);
    win.document.write("</body></html>"); win.document.close(); win.print(); setExportOpen(false);
  };

  const filteredPreview = filterOfficer==="ALL" ? preview
    : preview.filter(row=>["Morning (7AM - 5PM)","Night (5PM - 12AM)","Off"]
        .some(col=>row[col]?.split(", ").some((e:string)=>e.replace(" (Leave)","")===filterOfficer)));

  const chartKeys    = summary.length>0 ? Object.keys(summary[0]).filter(k=>k!=="Officer") : [];
  const pendingLeave = leaveReqs.filter(r=>r.status==="pending");
  const pendingSwaps = swaps.filter(s=>s.status==="pending");

  const sb=(s:string)=>({
    pending:"bg-yellow-100 text-yellow-800",approved:"bg-green-100 text-green-700",
    rejected:"bg-red-100 text-red-700",accepted:"bg-green-100 text-green-700",
    cancelled:"bg-gray-100 text-gray-600",
  }[s]??"bg-gray-100 text-gray-600");

  const MAIN_TABS=[
    {key:"schedule"  as MainTab, label:"📅 Schedule"},
    {key:"analytics" as MainTab, label:"📊 Analytics"},
    {key:"team"      as MainTab, label:"👥 Team", badge:pendingLeave.length+pendingSwaps.length},
    {key:"settings"  as MainTab, label:"⚙️ Settings"},
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <div className="glass-nav shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-5">
              <div className="bg-white/95 backdrop-blur shadow-xl rounded-2xl px-5 py-2.5">
                <SterlingLogo size="sm" variant="dark" />
              </div>
              <div className="border-l border-white/20 pl-5">
                <p className="text-white text-sm font-bold tracking-tight">SMO Timetable</p>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">{session.team_name} Lead</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-white text-xs font-bold">{session.display_name||session.email}</span>
                <span className="text-white/50 text-[10px] font-medium uppercase tracking-wider">Administrator</span>
              </div>
              <div className="flex items-center gap-2 text-white">
                <NotificationBell />
                <div className="h-6 w-[1px] bg-white/20 hidden sm:block"></div>
                <button onClick={onLogout} className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-4 py-2 rounded-xl transition-all text-xs active:scale-95">Logout</button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {MAIN_TABS.map(tab=>(
              <button key={tab.key} onClick={()=>setMainTab(tab.key)}
                className={`relative px-5 py-3 text-xs font-bold uppercase tracking-wider rounded-t-xl transition-all ${
                  mainTab===tab.key
                    ? "bg-[#f8fafc] text-[#7b1e3a] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]" 
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}>
                {tab.label}
                {(tab as any).badge>0 && <span className="absolute top-2 -right-1 w-4 h-4 bg-white text-[#7b1e3a] text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg animate-pulse">{(tab as any).badge}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 animate-fade-in">

        {/* ── ALERTS ── */}
        <div className="space-y-4 mb-8">
          {error && (
            <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} 
              className="p-4 bg-red-50/80 backdrop-blur border border-red-200 rounded-2xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <AlertCircle className="text-red-500" size={18} />
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
              <button onClick={()=>setError("")} className="text-red-400 hover:text-red-600 transition p-1">✕</button>
            </motion.div>
          )}
          
          {warnings.length > 0 && (
            <div className="animate-fade-in">
              <details className="group glass-card overflow-hidden border-yellow-200/50">
                <summary className={`flex items-center justify-between p-4 cursor-pointer list-none ${warnings.some(w=>w.severity==="error")?"bg-red-50/30":"bg-yellow-50/30"}`}>
                  <div className="flex items-center gap-3">
                    {warnings.some(w=>w.severity==="error") ? <AlertCircle className="text-red-500" size={18} /> : <AlertCircle className="text-yellow-500" size={18} />}
                    <span className="text-sm font-bold text-gray-700">
                      {warnings.some(w=>w.severity==="error") 
                        ? `${warnings.filter(w=>w.severity==="error").length} Leave Conflict(s)` 
                        : `${warnings.length} Capacity Warning(s)`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase group-open:hidden">View Details</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase hidden group-open:inline">Collapse</span>
                  </div>
                </summary>
                <div className="p-4 pt-0 space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-white/30">
                  {warnings.map((w,i)=>(
                    <div key={i} className={`p-3 rounded-xl text-xs font-medium border ${w.severity==="error"?"bg-red-100/50 border-red-200 text-red-800":"bg-yellow-100/50 border-yellow-200 text-yellow-800"}`}>
                      {w.message}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {holidayDates.length > 0 && (
            <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}}
              className="p-4 glass-card border-blue-200/50 bg-blue-50/30">
              <div className="flex items-center gap-3 mb-3">
                <CalendarDays className="text-blue-500" size={18} />
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Holidays this month</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {holidayDates.map(d=><span key={d} className="text-[10px] font-bold px-3 py-1 bg-white/80 text-blue-600 rounded-full border border-blue-100 shadow-sm">{d}</span>)}
              </div>
            </motion.div>
          )}
        </div>

        {/* ════ SCHEDULE ════ */}
        {mainTab==="schedule" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Left */}
            <div className="space-y-5">

              {/* Configuration Panel */}
              <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-[#7b1e3a]/10 rounded-xl text-[#7b1e3a]">
                    <Settings size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900">Configuration</h2>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Schedule Setup</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Year</label>
                      <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}
                        className="input-field" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Month</label>
                      <select value={month} onChange={e=>setMonth(Number(e.target.value))}
                        className="input-field">
                        {MONTHS.map((n,i)=><option key={i} value={i+1}>{n}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Shift Model</label>
                    <select value={shiftModelId??""} onChange={e=>setShiftModelId(e.target.value?Number(e.target.value):null)}
                      className="input-field">
                      <option value="">SMO Default (Standard 2/2)</option>
                      {shiftModels.map((m:any)=><option key={m.id} value={m.id}>{m.unit_name}</option>)}
                    </select>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer group py-1">
                    <input type="checkbox" checked={resetRot} onChange={e=>setResetRot(e.target.checked)} 
                      className="rounded-md border-gray-300 text-[#7b1e3a] focus:ring-[#7b1e3a]" />
                    <span className="text-xs font-semibold text-gray-600 group-hover:text-[#7b1e3a] transition">Reset rotation from officer 1</span>
                  </label>

                  {!shiftModelId && (
                    <label className="flex items-center gap-3 cursor-pointer group py-1">
                      <input type="checkbox" checked={noNightBeforeLeaveSMO} onChange={e=>setNoNightBeforeLeaveSMO(e.target.checked)} 
                        className="rounded-md border-gray-300 text-[#7b1e3a] focus:ring-[#7b1e3a]" />
                      <span className="text-xs font-semibold text-gray-600 group-hover:text-[#7b1e3a] transition">No night shift before leave</span>
                    </label>
                  )}

                  <label className="flex items-center gap-3 cursor-pointer group py-1 mt-2 p-2 bg-purple-50 rounded-lg border border-purple-100">
                    <input type="checkbox" checked={useAI} onChange={e=>setUseAI(e.target.checked)} 
                      className="rounded-md border-gray-300 text-purple-600 focus:ring-purple-600" />
                    <span className="text-xs font-bold text-purple-800 transition">✨ Optimize with AI Solver</span>
                  </label>

                  <div className="pt-2">
                    <button onClick={handleGenerate} disabled={loading}
                      className="btn-primary w-full flex items-center justify-center gap-3 shadow-[#7b1e3a]/20 shadow-xl">
                      {loading ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                      <span>{loading ? "Generating…" : "Generate Preview"}</span>
                    </button>
                    
                    {preview.length > 0 && !savedId && (
                      <button onClick={handleSave} className="btn-secondary w-full mt-3 bg-green-50 border-green-200 text-green-700 hover:bg-green-100 flex items-center justify-center gap-2">
                        <CheckCircle2 size={16} />
                        <span>Save Schedule</span>
                      </button>
                    )}
                    
                    {savedId && (
                      <div className="mt-4 space-y-2 animate-fade-in">
                        <button onClick={()=>handleSendEmails(savedId)} className="btn-secondary w-full bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 flex items-center justify-center gap-2">
                          <Mail size={16} />
                          <span>Email All Officers</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {officersUsed.length > 0 && (
                  <div className="mt-8 p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Officers included ({officersUsed.length})</p>
                    <p className="text-xs text-gray-500 leading-relaxed font-medium">{officersUsed.join(", ")}</p>
                  </div>
                )}

                {/* ── Shift Models ── */}
                <div className="mt-8 pt-8 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">🛠️ Shift Models</h3>
                    {!showModelForm && (
                      <button onClick={()=>setShowModelForm(true)}
                        className="text-[10px] font-bold text-[#7b1e3a] hover:opacity-70 transition uppercase">
                        + New
                      </button>
                    )}
                  </div>
                  
                  {!showModelForm && (
                    <div className="space-y-3">
                      {shiftModels.length === 0 && (
                        <p className="text-xs text-gray-400 italic bg-gray-50/50 p-4 rounded-xl border border-dashed border-gray-200 text-center">
                          No custom models. Using default SMO logic.
                        </p>
                      )}
                      {shiftModels.map((m:any)=>(
                        <div key={m.id} className="group bg-white/40 border border-gray-100 hover:border-[#7b1e3a]/20 rounded-xl px-4 py-3 transition-all hover:shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-800">{m.unit_name}</p>
                              <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1">
                                <span className="text-[10px] text-gray-400 font-medium">{m.working_days ? `${m.working_days.length}d/wk` : "7d/wk"}</span>
                                <span className="text-[10px] text-gray-400">•</span>
                                <span className="text-[10px] text-gray-400 font-medium">max {m.max_concurrent_leave??1} leave</span>
                              </div>
                            </div>
                            <button
                              onClick={async()=>{
                                if(!confirm(`Delete "${m.unit_name}"?`)) return;
                                try { await deleteShiftModel(m.id); await loadModels(); }
                                catch(e:any){ setError(e.response?.data?.detail??"Failed."); }
                              }}
                              className="text-[10px] font-bold text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition uppercase">
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Form is handled elsewhere but included here in original for layout */}
                  {showModelForm && (
                    <ShiftModelForm
                      onSave={async(payload)=>{
                        await createShiftModel(payload);
                        await loadModels();
                        setShowModelForm(false);
                        toast.success("Shift model created!");
                      }}
                      onCancel={()=>setShowModelForm(false)}
                    />
                  )}
                </div>
              </div>

              {/* Past schedules */}
              {pastSchedules.length > 0 && (
                <div className="glass-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <CalendarDays size={18} className="text-[#7b1e3a]" />
                      Past Schedules
                    </h3>
                    <button onClick={async()=>{ try { await triggerAutoDraft(); toast.success("Draft generated!"); await loadPast(); } catch(e:any) { setError(e.response?.data?.detail??"Failed."); } }}
                      className="text-[10px] font-bold text-purple-600 hover:text-purple-800 uppercase tracking-wider bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100 hover:bg-purple-100 transition">
                      ⚡ Auto-Draft
                    </button>
                  </div>
                  <div className="space-y-3">
                    {pastSchedules.slice(0,8).map((s:any)=>(
                      <div key={s.id} className="flex items-center justify-between bg-white/40 border border-gray-100 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-sm text-gray-800">{MONTHS[s.month-1]} {s.year}</p>
                              {s.is_published === false && (
                                <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full border border-yellow-200 animate-pulse">Draft</span>
                              )}
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${s.monthly_email_sent?"text-green-500":"text-orange-400"}`}>
                              {s.monthly_email_sent?"Sent":"Not sent"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {s.is_published === false && (
                            <button onClick={async()=>{ try { await publishSchedule(s.id); toast.success("Published!"); await loadPast(); } catch(e:any) { setError(e.response?.data?.detail??"Failed."); } }}
                              className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition text-[10px] font-bold uppercase border border-green-200 shadow-sm">
                              Publish
                            </button>
                          )}
                          <button onClick={()=>handleSendEmails(s.id)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition shadow-sm">
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right */}
            <div className="lg:col-span-2 space-y-5">

              {/* Officers Panel */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#7b1e3a]/10 rounded-xl text-[#7b1e3a]">
                      <Users size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Team Members</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{officers.length} active officers</p>
                    </div>
                  </div>
                  {!showOfficerForm && (
                    <button onClick={()=>{ setShowOfficerForm(true); setEditingOfficer(null); setOName(""); setOEmail(""); setOError(""); }}
                      className="btn-primary py-2 px-4 flex items-center gap-2 text-xs">
                      <Plus size={16} />
                      <span>Add</span>
                    </button>
                  )}
                </div>

                {showOfficerForm && (
                  <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}
                    className="mb-6 bg-white/40 border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
                    <h4 className="font-bold text-sm text-gray-800">{editingOfficer?"Edit Member":"New Member"}</h4>
                    {oError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2 font-medium">⚠️ {oError}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                        <input value={oName} onChange={e=>setOName(e.target.value)} placeholder="e.g. John Doe"
                          className="input-field" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Sterling Email</label>
                        <input value={oEmail} onChange={e=>setOEmail(e.target.value)} placeholder="name@sterling.ng"
                          className="input-field" />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={handleOfficerSave} disabled={oSaving}
                        className="btn-primary flex-1">
                        {oSaving ? "Saving…" : editingOfficer ? "Update" : "Add Member"}
                      </button>
                      <button onClick={()=>setShowOfficerForm(false)} className="btn-secondary px-6">Cancel</button>
                    </div>
                  </motion.div>
                )}

                {officers.length === 0 && !showOfficerForm && (
                  <div className="py-12 flex flex-col items-center justify-center text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                    <Users size={32} className="text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400 font-medium">No officers yet.</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {officers.map(o=>(
                    <div key={o.id} className="group flex items-center justify-between bg-white/50 backdrop-blur-sm border border-gray-100 hover:border-[#7b1e3a]/20 rounded-2xl px-5 py-4 transition-all hover:shadow-md">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7b1e3a] to-[#9b2a4e] flex items-center justify-center text-white font-bold text-sm shadow-md">
                          {o.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-800 truncate">
                            {o.name}
                            {o.is_teamlead && <span className="ml-2 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">Lead</span>}
                          </p>
                          <p className="text-[10px] text-gray-400 font-medium truncate">{o.email}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={()=>{ setEditingOfficer(o); setOName(o.name); setOEmail(o.email); setOError(""); setShowOfficerForm(true); }}
                          className="p-2 text-gray-400 hover:text-[#7b1e3a] transition-colors"><Settings size={14} /></button>
                        {!o.is_teamlead && (
                          <button onClick={()=>handleOfficerRemove(o)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Leave Management */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-xl text-orange-600">
                      <CalendarDays size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Leave Management</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Roster Blockers</p>
                    </div>
                  </div>
                  <button onClick={()=>{ setLeaveOpen(!leaveOpen); if(!leaveOpen) setLeaveOfficer(null); }}
                    className={`btn-secondary flex items-center gap-2 border-orange-200 text-orange-700 hover:bg-orange-50 ${leaveOpen?"bg-orange-500 text-white border-orange-500 hover:bg-orange-600":""}`}>
                    {leaveOpen ? <span>✕</span> : <CheckCircle2 size={16} />}
                    <span className="text-xs">{leaveOpen ? "Close" : "Set Leave"}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {Object.entries(leaveMap).filter(([,r])=>r.start).map(([name,r])=>(
                    <motion.div key={name} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}}
                      className="flex items-center justify-between bg-orange-50/50 backdrop-blur border border-orange-100 rounded-2xl px-5 py-3 shadow-sm">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{name}</p>
                        <p className="text-[10px] text-orange-600 font-bold uppercase tracking-tight">
                          {r.start?.toLocaleDateString()} {r.end ? `→ ${r.end.toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-1 ml-4">
                        <button onClick={()=>{ setLeaveOpen(true); setLeaveOfficer(name); }} className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"><Settings size={14} /></button>
                        <button onClick={()=>setLeaveMap(p=>({...p,[name]:{start:null,end:null}}))} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">✕</button>
                      </div>
                    </motion.div>
                  ))}
                  {Object.values(leaveMap).every(r=>!r.start) && (
                    <div className="col-span-full py-6 flex flex-col items-center justify-center text-center bg-gray-50/30 rounded-2xl border border-dashed border-gray-200">
                      <p className="text-xs text-gray-400 font-medium italic">No leave dates scheduled.</p>
                    </div>
                  )}
                </div>

                {leaveOpen && (
                  <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}
                    className="border-t border-gray-100 pt-8 mt-4">
                    {!leaveOfficer ? (
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Select Officer</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {officerNames.map(name=>(
                            <button key={name} onClick={()=>setLeaveOfficer(name)}
                              className={`px-4 py-3 rounded-2xl border-2 text-xs font-bold transition-all ${
                                leaveMap[name]?.start 
                                  ? "border-orange-500 bg-orange-50 text-orange-700 shadow-sm" 
                                  : "border-gray-100 bg-gray-50/50 text-gray-500 hover:border-[#7b1e3a]/20 hover:text-[#7b1e3a]"
                              }`}>
                              {name.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ):(
                      <div className="bg-white/60 backdrop-blur-md border border-gray-200 rounded-3xl p-6 shadow-xl max-w-md mx-auto">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h4 className="font-bold text-gray-900">{leaveOfficer}</h4>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Select Date Range</p>
                          </div>
                          <button onClick={()=>setLeaveOfficer(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                            <Plus size={20} className="rotate-45 text-gray-400" />
                          </button>
                        </div>
                        
                        <div className="flex justify-center mb-6">
                          <DatePicker inline selectsRange
                            startDate={leaveMap[leaveOfficer]?.start}
                            endDate={leaveMap[leaveOfficer]?.end}
                            minDate={new Date(year,month-1,1)}
                            maxDate={new Date(year,month,0)}
                            onChange={(range:any)=>{
                              let [start,end]=range;
                              if(start&&end&&end<start) [start,end]=[end,start];
                              setLeaveMap(prev=>({...prev,[leaveOfficer]:{start,end}}));
                              if(start&&end) toast.success("Leave period set!");
                            }}
                          />
                        </div>

                        <div className="flex gap-3">
                          <button onClick={()=>setLeaveMap(p=>({...p,[leaveOfficer]:{start:null,end:null}}))} 
                            className="btn-secondary border-red-100 text-red-500 hover:bg-red-50 flex-1">Clear</button>
                          <button onClick={()=>setLeaveOfficer(null)} className="btn-primary flex-1">Confirm</button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Sub-tabs & Content Area */}
              <div className="glass-card overflow-hidden">
                <div className="flex border-b border-gray-100 bg-gray-50/50 backdrop-blur-sm p-1 gap-1">
                  {(["view","print","swaps","holidays"] as SubTab[]).map(t=>(
                    <button key={t} onClick={()=>setSubTab(t)}
                      className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${
                        subTab===t 
                          ? "bg-white text-[#7b1e3a] shadow-sm ring-1 ring-black/5" 
                          : "text-gray-400 hover:text-gray-600 hover:bg-white/50"
                      }`}>
                      {t==="view"?"📋 Schedule":t==="print"?"🖨️ Print":t==="swaps"?"🔄 Swaps":"🗓️ Holidays"}
                    </button>
                  ))}
                </div>
                <div className="p-8">

                  {/* SCHEDULE VIEW */}
                  {subTab==="view"&&(
                    <div className="space-y-5">
                      {summary.length>0&&(
                        <div>
                          <p className="text-sm font-bold text-gray-700 mb-3">Shift Distribution</p>
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={summary} margin={{top:5,right:10,left:-10,bottom:5}}>
                              <XAxis dataKey="Officer" tick={{fontSize:10}} tickFormatter={v=>v.split(" ")[0]} />
                              <YAxis tick={{fontSize:11}} />
                              <Tooltip contentStyle={{fontSize:12,borderRadius:8}} />
                              <Legend wrapperStyle={{fontSize:12}} />
                              {chartKeys.map(key=><Bar key={key} dataKey={key} fill={BAR_COLORS[key]??"#6b7280"} radius={[3,3,0,0]} />)}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {preview.length>0&&(
                        <div ref={exportRef} className="space-y-5">
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <p className="font-bold text-[#7b1e3a]">Shift Summary — {MONTHS[month-1]} {year}</p>
                              <div className="flex items-center gap-2">
                                <select value={filterOfficer} onChange={e=>setFilterOfficer(e.target.value)}
                                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]">
                                  <option value="ALL">All Officers</option>
                                  {officersUsed.map(o=><option key={o} value={o}>{o}</option>)}
                                </select>
                                <div className="relative" ref={exportMenuRef}>
                                  <button onClick={()=>setExportOpen(!exportOpen)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition">Export ▾</button>
                                  {exportOpen&&(
                                    <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                                      <button onClick={exportExcel} className="block w-full text-left px-4 py-3 text-sm hover:bg-gray-50 border-b">📊 Excel</button>
                                      <button onClick={exportCSV}   className="block w-full text-left px-4 py-3 text-sm hover:bg-gray-50 border-b">📋 CSV</button>
                                      <button onClick={exportPDF}   className="block w-full text-left px-4 py-3 text-sm hover:bg-gray-50">📄 PDF</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gradient-to-r from-[#7b1e3a] to-[#a83250] text-white">
                                    <th className="px-4 py-3 text-left">Officer</th>
                                    {Object.keys(summary[0]??{}).filter(k=>k!=="Officer").map(col=>(
                                      <th key={col} className="px-4 py-3 text-center">{col}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(filterOfficer==="ALL"?summary:summary.filter(r=>r.Officer===filterOfficer)).map((row,i)=>(
                                    <tr key={i} className={`border-t ${i%2===0?"bg-gray-50":""}`}>
                                      <td className="px-4 py-3 font-medium">{row.Officer}</td>
                                      {Object.keys(row).filter(k=>k!=="Officer").map(col=>(
                                        <td key={col} className="px-4 py-3 text-center">
                                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${col==="Morning"?"bg-yellow-100 text-yellow-800":col==="Night"?"bg-blue-100 text-blue-800":col==="Leave"?"bg-orange-100 text-orange-700":"bg-gray-100 text-gray-700"}`}>
                                            {row[col]}
                                          </span>
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div>
                            <p className="font-bold text-[#7b1e3a] mb-3">Daily Schedule — {MONTHS[month-1]} {year}</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gradient-to-r from-blue-700 to-cyan-600 text-white">
                                    <th className="px-3 py-2.5 text-left whitespace-nowrap">Date</th>
                                    <th className="px-3 py-2.5 text-left whitespace-nowrap">Day</th>
                                    {preview.length > 0 && Object.keys(preview[0]).filter(k => !["Date", "Day", "12AM - 7AM (prev night)"].includes(k)).map(col => (
                                      <th key={col} className="px-3 py-2.5 text-left whitespace-nowrap">{col}</th>
                                    ))}
                                    {preview.length > 0 && preview[0]["12AM - 7AM (prev night)"] !== undefined && (
                                      <th className="px-3 py-2.5 text-left whitespace-nowrap">12AM–7AM (Prev Night)</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredPreview.map((row:any,i:number)=>(
                                    <tr key={i} className={`${i%2===0?"bg-gray-50":"bg-white"} hover:bg-blue-50 transition`}>
                                      <td className="px-3 py-2 font-semibold whitespace-nowrap border border-gray-100">{row.Date}</td>
                                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap border border-gray-100">{row.Day}</td>
                                      {Object.keys(row).filter(k => !["Date", "Day", "12AM - 7AM (prev night)"].includes(k)).map(col=>(
                                        <td key={col} className="px-3 py-2 border border-gray-100">
                                          {(row[col]??"").split(", ").filter(Boolean).map((entry:string,j:number)=>{
                                            const isLeave=entry.includes("(Leave)");
                                            const bg=isLeave?"bg-orange-100 text-orange-700":col.includes("Morning")?"bg-yellow-100 text-yellow-800":col.includes("Night")?"bg-blue-100 text-blue-800":"bg-gray-100 text-gray-600";
                                            return <span key={j} className={`inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${bg}`}>{entry}</span>;
                                          })}
                                        </td>
                                      ))}
                                      {row["12AM - 7AM (prev night)"] !== undefined && (
                                        <td className="px-3 py-2 border border-gray-100 italic text-gray-400">
                                          {row["12AM - 7AM (prev night)"]}
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                      {preview.length===0&&!loading&&(
                        <div className="text-center py-12">
                          <div className="text-5xl mb-3">📅</div>
                          <p className="text-gray-500 text-sm">{officers.length===0?"Add officers first, then generate a schedule.":"Configure settings and click Generate Preview."}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PRINT */}
                  {subTab==="print"&&(
                    preview.length>0?(
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-[#7b1e3a]">🖨️ Print Timetable</h3>
                          <button onClick={()=>{
                            const win=window.open("","","height=900,width=1200");
                            if(!win) return;
                            win.document.write(`<html><head><title>SMO Timetable</title><style>body{font-family:Arial,sans-serif;margin:20px;font-size:11px}h2{color:#7b1e3a}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;font-size:10px}th{background:#7b1e3a;color:white}tr:nth-child(even){background:#f9f9f9}</style></head><body>`);
                            win.document.write(`<h2>SMO Schedule - ${MONTHS[month-1]} ${year} - ${session.team_name}</h2>`);
                            win.document.write(`<table><thead><tr><th>Date</th><th>Day</th><th>Morning 7AM-5PM</th><th>Night 5PM-12AM</th><th>Off / Leave</th></tr></thead><tbody>`);
                            preview.forEach(row=>{win.document.write(`<tr><td><strong>${row.Date}</strong></td><td>${row.Day}</td><td>${row["Morning (7AM - 5PM)"]||""}</td><td>${row["Night (5PM - 12AM)"]||""}</td><td>${row.Off||""}</td></tr>`);});
                            win.document.write("</tbody></table></body></html>"); win.document.close(); win.print();
                          }} className="px-4 py-2 bg-[#7b1e3a] text-white rounded-lg text-sm font-semibold hover:bg-[#9b2a4e] transition">
                            🖨️ Print / Save PDF
                          </button>
                        </div>
                        <p className="text-sm text-gray-500">{MONTHS[month-1]} {year} · {officersUsed.length} officers</p>
                      </div>
                    ):(
                      <div className="text-center py-12"><div className="text-4xl mb-3">🖨️</div><p className="text-gray-500 text-sm">Generate a schedule first.</p></div>
                    )
                  )}

                  {/* SWAPS */}
                  {subTab==="swaps"&&(
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-[#7b1e3a]">🔄 Swap Requests</h3>
                        {pendingSwaps.length>0&&<span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium">{pendingSwaps.length} pending</span>}
                      </div>
                      {pendingSwaps.length===0&&<p className="text-sm text-gray-400 italic">No pending swap requests.</p>}
                      {pendingSwaps.map(s=>(
                        <div key={s.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-800">
                                <span className="text-[#7b1e3a]">{s.requester_name}</span>
                                <span className="text-gray-400 mx-1">gives</span>
                                <span className="font-mono text-xs bg-white border border-gray-200 px-1 rounded">{s.requester_date}</span>
                                <span className="text-gray-400 mx-1">takes</span>
                                <span className="font-mono text-xs bg-white border border-gray-200 px-1 rounded">{s.target_date}</span>
                                <span className="text-gray-400 mx-1">from</span>
                                <span className="text-[#7b1e3a]">{s.target_name}</span>
                              </p>
                              {s.reason&&<p className="text-xs text-gray-500 mt-0.5 italic">"{s.reason}"</p>}
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button onClick={()=>handleSwapResolve(s.id,"accept")} className="px-2.5 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 transition">Accept</button>
                              <button onClick={()=>handleSwapResolve(s.id,"reject")} className="px-2.5 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold hover:bg-red-200 transition">Reject</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {swaps.filter(s=>s.status!=="pending").length>0&&(
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">History</p>
                          {swaps.filter(s=>s.status!=="pending").slice(0,5).map(s=>(
                            <div key={s.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-1.5 text-xs">
                              <span>{s.requester_name} / {s.target_name} · {s.requester_date}/{s.target_date}</span>
                              <span className={`px-2 py-0.5 rounded-full font-medium ${sb(s.status)}`}>{s.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* HOLIDAYS */}
                  {subTab==="holidays"&&(
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-[#7b1e3a]">🗓️ Public Holidays</h3>
                        <div className="flex gap-2">
                          {allHolidays.length===0&&(
                            <button onClick={async()=>{ await seedNigerianHolidays(); await loadHolidays(); }} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition">+ Load Nigerian Holidays</button>
                          )}
                          <button onClick={()=>setShowHolidayForm(!showHolidayForm)} className="px-3 py-1.5 bg-[#7b1e3a] text-white rounded-lg text-xs font-semibold hover:bg-[#9b2a4e] transition">+ Add</button>
                        </div>
                      </div>
                      {showHolidayForm&&(
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-3">
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
                              <input value={hName} onChange={e=>setHName(e.target.value)} placeholder="e.g. Independence Day"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Month</label>
                              <select value={hMonth} onChange={e=>setHMonth(Number(e.target.value))} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]">
                                {MONTHS.map((n,i)=><option key={i} value={i+1}>{n.slice(0,3)}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Day</label>
                              <input type="number" min={1} max={31} value={hDay} onChange={e=>setHDay(Number(e.target.value))} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]" />
                            </div>
                            <div className="flex items-end pb-1">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={hRecurr} onChange={e=>setHRecurr(e.target.checked)} />
                                <span className="text-xs text-gray-700">Annual</span>
                              </label>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleHolidayAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#7b1e3a] hover:bg-[#9b2a4e] transition">Add</button>
                            <button onClick={()=>setShowHolidayForm(false)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                          </div>
                        </div>
                      )}
                      {allHolidays.length===0&&!showHolidayForm&&<p className="text-sm text-gray-400 italic">No holidays configured.</p>}
                      <div className="space-y-1.5">
                        {allHolidays.map((h:any)=>(
                          <div key={h.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-gray-500 min-w-[60px]">{MONTHS[h.month-1].slice(0,3)} {String(h.day).padStart(2,"0")}</span>
                              <span className="text-sm font-medium text-gray-800">{h.name}</span>
                              {h.recurring&&<span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Annual</span>}
                            </div>
                            <button onClick={async()=>{ await deleteHoliday(h.id); await loadHolidays(); }} className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition">Remove</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ ANALYTICS ════ */}
        {mainTab==="analytics"&&(
          <div className="bg-white rounded-xl shadow p-6 space-y-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Month</label>
                <select value={month} onChange={e=>setMonth(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]">
                  {MONTHS.map((n,i)=><option key={i} value={i+1}>{n}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Year</label>
                <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))} className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]" />
              </div>
              <div className="flex items-end"><button onClick={loadAnalytics} className="px-4 py-2 bg-[#7b1e3a] text-white rounded-lg text-sm font-semibold hover:bg-[#9b2a4e] transition">Load</button></div>
            </div>
            {analytics?(
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
                {(analytics.current?.officers??[]).length>0&&(
                  <div>
                    <p className="text-sm font-bold text-gray-700 mb-3">Shifts per officer</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={analytics.current.officers} margin={{top:5,right:10,left:-10,bottom:5}}>
                        <XAxis dataKey="officer" tick={{fontSize:10}} tickFormatter={v=>v.split(" ")[0]} />
                        <YAxis tick={{fontSize:11}} />
                        <Tooltip contentStyle={{fontSize:12,borderRadius:8}} />
                        <Legend wrapperStyle={{fontSize:12}} />
                        <Bar dataKey="morning" name="Morning" fill="#f59e0b" radius={[3,3,0,0]} />
                        <Bar dataKey="night"   name="Night"   fill="#3b82f6" radius={[3,3,0,0]} />
                        <Bar dataKey="off"     name="Off"     fill="#9ca3af" radius={[3,3,0,0]} />
                        <Bar dataKey="leave"   name="Leave"   fill="#f97316" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
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
            ):(
              <p className="text-sm text-gray-400 italic text-center py-8">Select a month and click Load.</p>
            )}
          </div>
        )}

        {/* ════ TEAM ════ */}
        {mainTab==="team"&&(
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl shadow p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#7b1e3a]">📋 Leave Requests</h3>
                {pendingLeave.length>0&&<span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium">{pendingLeave.length} pending</span>}
              </div>
              {leaveReqs.length===0&&<p className="text-sm text-gray-400 italic">No leave requests.</p>}
              <div className="space-y-2">
                {leaveReqs.map(r=>(
                  <div key={r.id} className={`border rounded-lg p-3 ${r.status==="pending"?"bg-yellow-50 border-yellow-200":"bg-gray-50 border-gray-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{r.officer_name}<span className="text-gray-400 text-xs ml-1">{r.officer_email}</span></p>
                        <p className="text-xs text-gray-600 mt-0.5">{r.start_date} to {r.end_date}</p>
                        {r.reason&&<p className="text-xs text-gray-500 italic">"{r.reason}"</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb(r.status)}`}>{r.status}</span>
                        {r.status==="pending"&&(
                          <>
                            <button onClick={()=>handleLeaveReview(r.id,"approve")} className="px-2 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 transition">Approve</button>
                            <button onClick={()=>handleLeaveReview(r.id,"reject")}  className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold hover:bg-red-200 transition">Reject</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#7b1e3a]">🔄 Swap Requests</h3>
                {pendingSwaps.length>0&&<span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium">{pendingSwaps.length} pending</span>}
              </div>
              {swaps.length===0&&<p className="text-sm text-gray-400 italic">No swap requests.</p>}
              <div className="space-y-2">
                {swaps.slice(0,10).map(s=>(
                  <div key={s.id} className={`border rounded-lg p-3 ${s.status==="pending"?"bg-yellow-50 border-yellow-200":"bg-gray-50 border-gray-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{s.requester_name} / {s.target_name}</p>
                        <p className="text-xs text-gray-600">{s.requester_date} / {s.target_date}</p>
                        {s.reason&&<p className="text-xs text-gray-500 italic">"{s.reason}"</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb(s.status)}`}>{s.status}</span>
                        {s.status==="pending"&&(
                          <>
                            <button onClick={()=>handleSwapResolve(s.id,"accept")} className="px-2 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 transition">Accept</button>
                            <button onClick={()=>handleSwapResolve(s.id,"reject")}  className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold hover:bg-red-200 transition">Reject</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════ SETTINGS ════ */}
        {mainTab==="settings"&&(
          <div className="max-w-lg">
            <div className="bg-white rounded-xl shadow p-5">
              <h3 className="font-bold text-[#7b1e3a] mb-4">⚙️ Automation Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Auto-Generate Day</label>
                  <input type="number" min={1} max={28} value={settings.auto_generate_day}
                    onChange={e=>setSettings({...settings,auto_generate_day:Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]" />
                  <p className="text-xs text-gray-400 mt-1">Day of month to auto-generate next month's schedule</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email Send Day</label>
                  <input type="number" min={1} max={28} value={settings.send_day}
                    onChange={e=>setSettings({...settings,send_day:Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Send Hour</label>
                  <select value={settings.send_hour}
                    onChange={e=>setSettings({...settings,send_hour:Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]">
                    {Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>)}
                  </select>
                </div>
                <button onClick={async()=>{ await saveSettings(settings); showMsg("Settings saved."); }}
                  className="w-full py-2.5 rounded-lg font-semibold text-white bg-[#7b1e3a] hover:bg-[#9b2a4e] transition text-sm">
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ChatPanel session={session} />
    </div>
  );
}