import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Building2, Users, LayoutDashboard, LogOut, Loader2,
  ShieldAlert, Activity, TrendingUp, CheckCircle2
} from "lucide-react";
import { api, type UserSession } from "../services/api";
import SterlingLogo from "../components/SterlingLogo";
import toast from "react-hot-toast";

type Props = { session: UserSession; onLogout: () => void };

export default function SuperAdminDashboard({ session, onLogout }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/admin/dashboard");
      setData(res.data);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "Failed to load admin dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-['Outfit',sans-serif]">
      {/* ── TOP NAVIGATION ── */}
      <nav className="sticky top-0 z-50 glass-nav border-b border-white/20 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SterlingLogo size="sm" />
            <div className="h-8 w-[1px] bg-gray-200 hidden sm:block"></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#7b1e3a] flex items-center gap-1"><ShieldAlert size={12}/> Super Admin</p>
              <p className="text-xs font-bold text-gray-500">Global Overview</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Welcome back</p>
              <p className="text-sm font-bold text-gray-900">{session.display_name}</p>
            </div>
            
            <button onClick={onLogout} 
              className="flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-red-50 text-red-500 rounded-xl transition-all font-bold text-xs border border-red-100/50 shadow-sm">
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8 animate-fade-in">
        {loading ? (
          <div className="py-32 flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-[#7b1e3a]" size={40} />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Compiling Global Metrics...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10"><Users size={64}/></div>
                <div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Total Users</p>
                  <p className="text-4xl font-black text-gray-900 mt-2">{data?.metrics?.total_users || 0}</p>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-green-600">
                  <TrendingUp size={14} /> Active across org
                </div>
              </div>
              <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10"><Building2 size={64}/></div>
                <div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Active Teams</p>
                  <p className="text-4xl font-black text-[#7b1e3a] mt-2">{data?.metrics?.total_teams || 0}</p>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-gray-500">
                  <LayoutDashboard size={14} /> Departments tracked
                </div>
              </div>
              <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
                <div className="absolute top-0 right-0 p-6 text-indigo-500 opacity-10"><Activity size={64}/></div>
                <div>
                  <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">Global Equity Index</p>
                  <p className="text-4xl font-black text-indigo-600 mt-2">{data?.metrics?.avg_fairness || "N/A"}</p>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-indigo-500">
                  <CheckCircle2 size={14} /> System-wide balance
                </div>
              </div>
            </div>

            <div className="glass-card p-8">
              <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2"><Building2 size={18} className="text-[#7b1e3a]"/> Team Performance Overview</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Team Name</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Members</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Latest Equity Score</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.teams || []).map((t: any) => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                        <td className="px-6 py-4 font-bold text-gray-800">{t.name}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-600">{t.members} officers</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-black ${
                            t.latest_fairness.includes("N/A") ? "bg-gray-100 text-gray-500" :
                            parseInt(t.latest_fairness) >= 75 ? "bg-green-100 text-green-700" :
                            parseInt(t.latest_fairness) >= 50 ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {t.latest_fairness}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <span className="text-xs font-bold text-green-500 flex items-center justify-end gap-1"><CheckCircle2 size={12}/> Active</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!data?.teams || data.teams.length === 0) && (
                  <p className="text-center text-sm font-medium text-gray-400 py-8">No teams found.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
