import { useState, useEffect } from "react";
import {
  fetchShiftModels, createShiftModel, updateShiftModel,
  deleteShiftModel, type ShiftTypeConfig, type ShiftModelPayload,
} from "../services/api";

const ALL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const COLORS   = ["#fbbf24","#3b82f6","#10b981","#f97316","#8b5cf6","#ef4444"];

function makeId() { return Math.random().toString(36).slice(2, 8); }

type Local = ShiftTypeConfig & { id: string };

const defaults: Local[] = [
  { id: makeId(), name: "Morning", start_time: "07:00", end_time: "17:00", count: 2, color: "#fbbf24" },
  { id: makeId(), name: "Night",   start_time: "17:00", end_time: "07:00", count: 2, color: "#3b82f6" },
];

type Props = { onSaved?: () => void };

export default function ShiftModelBuilder({ onSaved }: Props) {
  const [models,      setModels]      = useState<(ShiftModelPayload & { id: number })[]>([]);
  const [showForm,    setShowForm]    = useState(false);
  const [editingId,   setEditingId]   = useState<number | null>(null);
  const [unitName,    setUnitName]    = useState("");
  const [types,       setTypes]       = useState<Local[]>(defaults);
  const [days,        setDays]        = useState<string[]>([...ALL_DAYS]);
  const [allDays,     setAllDays]     = useState(true);
  const [maxLeave,    setMaxLeave]    = useState(1);
  const [nightCont,   setNightCont]   = useState(true);
  const [noNight,     setNoNight]     = useState(false);
  const [error,       setError]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [success,     setSuccess]     = useState("");

  const load = async () => {
    try { setModels(await fetchShiftModels()); } catch {}
  };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setUnitName(""); setTypes(defaults.map((s) => ({ ...s, id: makeId() })));
    setDays([...ALL_DAYS]); setAllDays(true); setMaxLeave(1); setNightCont(true); setNoNight(false);
    setEditingId(null); setError(""); setShowForm(false);
  };

  const openEdit = (m: ShiftModelPayload & { id: number }) => {
    setUnitName(m.unit_name);
    setTypes((m.shift_types as ShiftTypeConfig[]).map((s) => ({ ...s, id: makeId() })));
    const wd = m.working_days ?? ALL_DAYS;
    setDays(wd); setAllDays(wd.length === 7);
    setMaxLeave(m.max_concurrent_leave ?? 1);
    setNightCont(m.night_continues ?? true);
    setNoNight(m.no_night_before_leave ?? false);
    setEditingId(m.id); setShowForm(true);
  };

  const toggleDay = (day: string) => {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setDays(next); setAllDays(next.length === 7);
  };

  const updateType = (id: string, field: keyof ShiftTypeConfig, val: any) =>
    setTypes((p) => p.map((s) => s.id === id ? { ...s, [field]: val } : s));

  const handleSave = async () => {
    if (!unitName.trim())                  { setError("Unit name is required."); return; }
    if (types.some((s) => !s.name.trim())) { setError("All shifts need a name."); return; }
    if (days.length === 0)                 { setError("Select at least one working day."); return; }
    if (maxLeave < 1)                      { setError("Max concurrent leave must be at least 1."); return; }

    const payload: ShiftModelPayload = {
      unit_name:            unitName.trim(),
      shift_types:          types.map(({ id: _id, ...s }) => s),
      working_days:         allDays ? null : days,
      max_concurrent_leave: maxLeave,
      night_continues:      nightCont,
      no_night_before_leave: noNight,
    };
    setError(""); setSaving(true); setSuccess("");
    try {
      editingId
        ? await updateShiftModel(editingId, payload)
        : await createShiftModel(payload);
      setSuccess(editingId ? "Model updated!" : "Model saved!");
      await load(); onSaved?.();
      setTimeout(() => { setSuccess(""); reset(); }, 1500);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Failed to save.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`Delete this model?`)) return;
    try { await deleteShiftModel(id); await load(); onSaved?.(); }
    catch (e: any) { alert(e.response?.data?.detail ?? "Failed to delete."); }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-[#7b1e3a]">🛠️ Shift Models</h3>
        {!showForm && (
          <button
            onClick={() => { reset(); setShowForm(true); }}
            className="px-3 py-1.5 bg-[#7b1e3a] text-white rounded-lg text-sm font-semibold hover:bg-[#9b2a4e] transition"
          >
            + New Model
          </button>
        )}
      </div>

      {!showForm && (
        <div className="space-y-2">
          {models.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              No custom models — SMO Default (2 Morning / 2 Night, max 1 on leave) is always available.
            </p>
          )}
          {models.map((m) => (
            <div key={m.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{m.unit_name}</p>
                <p className="text-xs text-gray-500">
                  {m.shift_types.map((s: any) => `${s.name} ×${s.count}`).join(" · ")}
                  {" · "}max {m.max_concurrent_leave ?? 1} on leave
                  {m.working_days ? ` · ${m.working_days.length}d/week` : " · 7d/week"}
                  {m.night_continues ? " · Night→7AM" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(m)}
                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition">
                  Edit
                </button>
                <button onClick={() => handleDelete(m.id)}
                  className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="space-y-5">
          {error   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">⚠️ {error}</p>}
          {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">✅ {success}</p>}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Unit / Team Name</label>
            <input value={unitName} onChange={(e) => setUnitName(e.target.value)}
              placeholder="e.g. Alpha Team" disabled={editingId !== null}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a] disabled:bg-gray-100" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Working Days</label>
              <button onClick={() => { setAllDays(!allDays); setDays(allDays ? [] : [...ALL_DAYS]); }}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition">
                {allDays ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_DAYS.map((day) => (
                <button key={day} onClick={() => toggleDay(day)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    days.includes(day) ? "bg-[#7b1e3a] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}>
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Max Officers on Leave at Same Time
              </label>
              <input type="number" min={1} max={10} value={maxLeave}
                onChange={(e) => setMaxLeave(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]" />
              <p className="text-xs text-gray-400 mt-1">
                SMO default is 1. Generation blocks if exceeded.
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={nightCont}
                  onChange={(e) => setNightCont(e.target.checked)} className="rounded mt-0.5" />
                <span className="text-sm text-gray-700">
                  Night shift continues to 7AM next day
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Adds 12AM–7AM column in timetable
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={noNight}
                  onChange={(e) => setNoNight(e.target.checked)} className="rounded mt-0.5" />
                <span className="text-sm text-gray-700">
                  No night shift before leave
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Restricts night shift on the day prior to approved leave
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Shift Types</label>
              <button
                onClick={() => setTypes((p) => [...p, {
                  id: makeId(), name: "", start_time: "", end_time: "",
                  count: 2, color: COLORS[p.length % COLORS.length],
                }])}
                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition"
              >
                + Add Shift
              </button>
            </div>
            <div className="space-y-3">
              {types.map((s) => (
                <div key={s.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Shift Name</label>
                      <input value={s.name} onChange={(e) => updateType(s.id, "name", e.target.value)}
                        placeholder="e.g. Morning"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#7b1e3a]" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Officers Required</label>
                      <input type="number" min={1} max={20} value={s.count}
                        onChange={(e) => updateType(s.id, "count", Number(e.target.value))}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#7b1e3a]" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Start Time</label>
                      <input type="time" value={s.start_time ?? ""}
                        onChange={(e) => updateType(s.id, "start_time", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#7b1e3a]" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">End Time</label>
                      <input type="time" value={s.end_time ?? ""}
                        onChange={(e) => updateType(s.id, "end_time", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#7b1e3a]" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Colour</label>
                      <input type="color" value={s.color ?? "#6b7280"}
                        onChange={(e) => updateType(s.id, "color", e.target.value)}
                        className="w-8 h-6 rounded cursor-pointer border-0" />
                    </div>
                    {types.length > 1 && (
                      <button onClick={() => setTypes((p) => p.filter((x) => x.id !== s.id))}
                        className="text-xs text-red-500 hover:text-red-700 transition">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className={`flex-1 py-2.5 rounded-lg font-semibold text-white transition ${
                saving ? "bg-gray-400 cursor-not-allowed" : "bg-[#7b1e3a] hover:bg-[#9b2a4e]"
              }`}>
              {saving ? "Saving…" : editingId !== null ? "Update Model" : "Save Model"}
            </button>
            <button onClick={reset}
              className="px-4 py-2.5 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}