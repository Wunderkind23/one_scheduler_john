import { useState, useEffect } from "react";
import {
  fetchSwaps, createSwap, resolveSwap,
} from "../services/api";

type SwapRequest = {
  id: number;
  requester_name: string;
  target_name: string;
  requester_date: string;
  target_date: string;
  requester_shift?: string | null;
  target_shift?: string | null;
  reason?: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
  schedule_id?: number;
};

type Props = {
  officerNames: string[];
  scheduleId?: number | null;
  currentUser?: string;
};

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  accepted:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function ShiftSwapPanel({ officerNames, scheduleId, currentUser }: Props) {
  const [swaps,      setSwaps]      = useState<SwapRequest[]>([]);
  const [showForm,   setShowForm]   = useState(false);
  const [filter,     setFilter]     = useState<"all" | "pending">("pending");
  const [requester,  setRequester]  = useState(officerNames[0] ?? "");
  const [target,     setTarget]     = useState("");
  const [reqDate,    setReqDate]    = useState("");
  const [tgtDate,    setTgtDate]    = useState("");
  const [reason,     setReason]     = useState("");
  const [error,      setError]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState("");

  const load = async () => {
    try {
      const data = await fetchSwaps(filter === "pending" ? "pending" : undefined);
      setSwaps(data as SwapRequest[]);
    } catch {}
  };

  useEffect(() => { load(); }, [filter]);

  const handleCreate = async () => {
    if (!requester)         { setError("Select the requesting officer."); return; }
    if (!target)            { setError("Select the officer to swap with."); return; }
    if (!reqDate)           { setError("Enter the requesting officer's date."); return; }
    if (!tgtDate)           { setError("Enter the target officer's date."); return; }
    if (requester === target){ setError("Cannot swap with yourself."); return; }

    setSaving(true); setError("");
    try {
      await createSwap({
        target_name:    target,
        requester_date: reqDate,
        target_date:    tgtDate,
        reason:         reason || undefined,
        schedule_id:    scheduleId ?? undefined,
      });
      setShowForm(false);
      setReason(""); setReqDate(""); setTgtDate("");
      setMsg("Swap request submitted successfully.");
      setTimeout(() => setMsg(""), 5000);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Failed to submit swap request.");
    } finally { setSaving(false); }
  };

  const handleResolve = async (id: number, action: "accept" | "reject" | "cancel") => {
    try {
      await resolveSwap(id, action);
      const verb = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "cancelled";
      setMsg(`Swap request ${verb}.`);
      setTimeout(() => setMsg(""), 3000);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Failed to resolve swap.");
    }
  };

  const pending  = swaps.filter((s) => s.status === "pending");
  const resolved = swaps.filter((s) => s.status !== "pending");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[#7b1e3a]">🔄 Shift Swaps</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Officers can request to swap shifts. Any team member can approve.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]"
          >
            <option value="pending">Pending only</option>
            <option value="all">All requests</option>
          </select>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-3 py-1.5 bg-[#7b1e3a] text-white rounded-lg text-xs font-semibold hover:bg-[#9b2a4e] transition"
            >
              + New Swap
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">⚠️ {error}</p>
      )}
      {msg && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">✅ {msg}</p>
      )}

      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-gray-800 text-sm">New Swap Request</h4>
          <p className="text-xs text-gray-500">
            Officer A gives away their shift on Date A, and takes Officer B's shift on Date B.
            Dates can be the same (same-day swap) or different.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Requesting Officer <span className="text-red-500">*</span>
              </label>
              <select
                value={requester}
                onChange={(e) => setRequester(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]"
              >
                <option value="">Select officer…</option>
                {officerNames.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Their date to give away <span className="text-red-500">*</span>
              </label>
              <input
                type="date" value={reqDate}
                onChange={(e) => setReqDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Swap With Officer <span className="text-red-500">*</span>
              </label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]"
              >
                <option value="">Select officer…</option>
                {officerNames.filter((o) => o !== requester).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Their date to take on <span className="text-red-500">*</span>
              </label>
              <input
                type="date" value={tgtDate}
                onChange={(e) => setTgtDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Reason (optional)
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Family event, medical appointment…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate} disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${
                saving ? "bg-gray-400 cursor-not-allowed" : "bg-[#7b1e3a] hover:bg-[#9b2a4e]"
              }`}
            >
              {saving ? "Submitting…" : "Submit Swap Request"}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(""); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Pending ({pending.length})
          </p>
          <div className="space-y-2">
            {pending.map((s) => (
              <div key={s.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">
                      <span className="text-[#7b1e3a]">{s.requester_name}</span>
                      <span className="text-gray-400 mx-1">gives away</span>
                      <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                        {s.requester_date} {s.requester_shift ? `(${s.requester_shift})` : ""}
                      </span>
                      <span className="text-gray-400 mx-1">↔ takes</span>
                      <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                        {s.target_date} {s.target_shift ? `(${s.target_shift})` : ""}
                      </span>
                      <span className="text-gray-400 mx-1">from</span>
                      <span className="text-[#7b1e3a]">{s.target_name}</span>
                    </p>
                    {s.reason && (
                      <p className="text-xs text-gray-500 mt-1 italic">"{s.reason}"</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Requested {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleResolve(s.id, "accept")}
                      className="px-2.5 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 transition"
                    >
                      ✓ Accept
                    </button>
                    <button
                      onClick={() => handleResolve(s.id, "reject")}
                      className="px-2.5 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold hover:bg-red-200 transition"
                    >
                      ✗ Reject
                    </button>
                    <button
                      onClick={() => handleResolve(s.id, "cancel")}
                      className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {filter === "all" && resolved.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">History</p>
          <div className="space-y-1.5">
            {resolved.slice(0, 10).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <span className="text-gray-700">
                  {s.requester_name} ↔ {s.target_name}
                  <span className="text-gray-400 text-xs ml-2">
                    {s.requester_date} {s.requester_shift ? `(${s.requester_shift})` : ""} / {s.target_date} {s.target_shift ? `(${s.target_shift})` : ""}
                  </span>
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {swaps.length === 0 && (
        <p className="text-sm text-gray-400 italic">No swap requests yet.</p>
      )}

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <strong>How swap requests work:</strong> Any team member submits a request specifying
        which dates to exchange. Once a team lead or any member accepts it, the schedule is
        automatically updated to reflect the swap.
      </div>
    </div>
  );
}