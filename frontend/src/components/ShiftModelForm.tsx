import { useState } from "react";

const ALL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const PRESET_COLORS = ["#f59e0b","#3b82f6","#10b981","#f97316","#8b5cf6","#ef4444","#06b6d4","#84cc16"];

type ShiftType = {
  _id:        string;
  name:       string;
  start_time: string;
  end_time:   string;
  count:      number;
  color:      string;
};

type Props = {
  onSave:   (payload: any) => Promise<void>;
  onCancel: () => void;
};

function uid() { return Math.random().toString(36).slice(2, 8); }

export default function ShiftModelForm({ onSave, onCancel }: Props) {
  const [name,        setName]        = useState("");
  const [shifts,      setShifts]      = useState<ShiftType[]>([
    { _id: uid(), name: "Morning", start_time: "07:00", end_time: "17:00", count: 2, color: "#f59e0b" },
    { _id: uid(), name: "Night",   start_time: "17:00", end_time: "07:00", count: 2, color: "#3b82f6" },
  ]);
  const [selectedDays,  setSelectedDays]  = useState<string[]>([...ALL_DAYS]);
  const [maxLeave,      setMaxLeave]      = useState(1);
  const [nightCont,     setNightCont]     = useState(true);
  const [noNightBeforeLeave, setNoNightBeforeLeave] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");

  const allSelected = selectedDays.length === 7;

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const addShift = () => setShifts((prev) => [
    ...prev,
    {
      _id: uid(), name: "", start_time: "08:00", end_time: "16:00",
      count: 2, color: PRESET_COLORS[prev.length % PRESET_COLORS.length],
    },
  ]);

  const updateShift = (_id: string, field: keyof Omit<ShiftType, "_id">, value: any) =>
    setShifts((prev) => prev.map((s) => s._id === _id ? { ...s, [field]: value } : s));

  const removeShift = (_id: string) =>
    setShifts((prev) => prev.filter((s) => s._id !== _id));

  const handleSave = async () => {
    setError("");
    if (!name.trim())                        { setError("Enter a model name."); return; }
    if (shifts.length === 0)                 { setError("Add at least one shift type."); return; }
    if (shifts.some((s) => !s.name.trim()))  { setError("All shifts must have a name."); return; }
    if (selectedDays.length === 0)           { setError("Select at least one working day."); return; }
    if (maxLeave < 1)                        { setError("Max concurrent leave must be at least 1."); return; }

    setSaving(true);
    try {
      await onSave({
        unit_name:            name.trim(),
        shift_types:          shifts.map(({ _id, ...s }) => s),
        working_days:         allSelected ? null : selectedDays,
        max_concurrent_leave: maxLeave,
        night_continues:      nightCont,
        no_night_before_leave: noNightBeforeLeave,
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to save.");
      setSaving(false);
    }
  };

  const totalOfficersPerDay = shifts.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="bg-white border-2 border-[#7b1e3a] border-opacity-20 rounded-xl p-4 space-y-4 mt-2">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm text-[#7b1e3a]">New Shift Model</h4>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
          {totalOfficersPerDay} officer{totalOfficersPerDay !== 1 ? "s" : ""} per day
        </span>
      </div>

      {error && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Model Name */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Model Name <span className="text-red-400">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alpha Team, EOAM Crew, Weekend Ops"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]"
        />
      </div>

      {/* Shift Types */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-700">
            Shift Types <span className="text-red-400">*</span>
          </label>
          <button
            type="button"
            onClick={addShift}
            className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition font-medium"
          >
            + Add Shift
          </button>
        </div>

        <div className="space-y-2">
          {shifts.map((s, idx) => (
            <div key={s._id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500">Shift {idx + 1}</span>
                {shifts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeShift(s._id)}
                    className="text-xs text-red-400 hover:text-red-600 transition"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Shift name</label>
                  <input
                    value={s.name}
                    onChange={(e) => updateShift(s._id, "name", e.target.value)}
                    placeholder="e.g. Morning, Night, Afternoon"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#7b1e3a]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">
                    Officers on duty
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={s.count}
                    onChange={(e) => updateShift(s._id, "count", Math.max(1, Number(e.target.value)))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#7b1e3a]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Start time</label>
                  <input
                    type="time"
                    value={s.start_time}
                    onChange={(e) => updateShift(s._id, "start_time", e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#7b1e3a]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">End time</label>
                  <input
                    type="time"
                    value={s.end_time}
                    onChange={(e) => updateShift(s._id, "end_time", e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#7b1e3a]"
                  />
                </div>
              </div>

              {/* Colour picker */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-500">Colour:</span>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateShift(s._id, "color", c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${
                      s.color === c ? "border-gray-700 scale-125" : "border-transparent hover:scale-110"
                    }`}
                    style={{ background: c }}
                  />
                ))}
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => updateShift(s._id, "color", e.target.value)}
                  className="w-6 h-5 rounded cursor-pointer border-0 p-0 ml-1"
                  title="Custom colour"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Working Days */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-gray-700">Working Days</label>
          <button
            type="button"
            onClick={() => setSelectedDays(allSelected ? [] : [...ALL_DAYS])}
            className="text-xs text-[#7b1e3a] underline hover:no-underline"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                selectedDays.includes(day)
                  ? "bg-[#7b1e3a] text-white border-[#7b1e3a]"
                  : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {selectedDays.length === 0
            ? "⚠️ No days selected"
            : selectedDays.length === 7
            ? "7 days a week"
            : `${selectedDays.length} days/week: ${selectedDays.map((d) => d.slice(0, 3)).join(", ")}`}
        </p>
      </div>

      {/* Leave & night settings */}
      <div className="space-y-3 pt-1 border-t border-gray-100">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Max officers on leave at the same time
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={20}
              value={maxLeave}
              onChange={(e) => setMaxLeave(Math.max(1, Number(e.target.value)))}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]"
            />
            <p className="text-xs text-gray-400 flex-1">
              Schedule generation will block if more officers than this are on leave on the same day.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={nightCont}
            onChange={(e) => setNightCont(e.target.checked)}
            className="rounded mt-0.5"
          />
          <div>
            <p className="text-xs font-semibold text-gray-700">Night shift continues to 7AM next day</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Adds a "12AM–7AM" column showing officers still on duty from the previous night's shift.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={noNightBeforeLeave}
            onChange={(e) => setNoNightBeforeLeave(e.target.checked)}
            className="rounded mt-0.5"
          />
          <div>
            <p className="text-xs font-semibold text-gray-700">No night shift before leave</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Restricts night shift on the day prior to approved leave.
            </p>
          </div>
        </label>
      </div>

      {/* Live preview */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-blue-700 mb-1">Preview</p>
        <p className="text-xs text-blue-600 leading-relaxed">
          <span className="font-semibold">{name || "Unnamed model"}</span>
          {" — "}
          {shifts.length > 0
            ? shifts.map((s) => `${s.name || "?"} (${s.count} officer${s.count !== 1 ? "s" : ""}, ${s.start_time || "?"}–${s.end_time || "?"})`).join(" | ")
            : "No shifts defined"}
          <br />
          {selectedDays.length === 7 ? "7 days/week" : selectedDays.length === 0 ? "No working days" : `${selectedDays.length} days/week`}
          {" · "}Max {maxLeave} on leave simultaneously
          {nightCont ? " · Night continues to 7AM" : ""}
          {noNightBeforeLeave ? " · No night shift before leave" : ""}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition ${
            saving ? "bg-gray-400 cursor-not-allowed" : "bg-[#7b1e3a] hover:bg-[#9b2a4e]"
          }`}
        >
          {saving ? "Saving…" : "Save Shift Model"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}