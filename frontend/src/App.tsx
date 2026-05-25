import { useState, useEffect } from "react";
import { getMe, type UserSession } from "./services/api";
import LoginPage         from "./pages/Login";
import TeamSetupPage     from "./pages/TeamSetupPage";
import TeamLeadDashboard from "./pages/TeamLeadDashboard";
import OfficerDashboard  from "./pages/OfficerDashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import PushPrompt from "./components/PushPrompt";
import SkeletonLoader from "./components/SkeletonLoader";

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    getMe()
      .then((me) => setSession({
        token,
        email:        me.email,
        display_name: me.display_name,
        role:         me.role as any,
        team_id:      me.team_id,
        team_name:    me.team_name,
        is_superadmin: me.is_superadmin,
      }))
      .catch(() => {
        // Token expired or invalid — clear and go to login
        localStorage.removeItem("token");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = (s: UserSession) => {
    localStorage.setItem("token", s.token);
    setSession(s);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setSession(null);
  };

  const handleTeamJoined = (updated: Partial<UserSession>) => {
    // Refresh role from server after team action
    const token = localStorage.getItem("token");
    if (!token) return;
    getMe()
      .then((me) => setSession({
        token,
        email:        me.email,
        display_name: me.display_name,
        role:         me.role as any,
        team_id:      me.team_id,
        team_name:    me.team_name,
        is_superadmin: me.is_superadmin,
      }))
      .catch(() => {
        if (session) setSession({ ...session, ...updated });
      });
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex flex-col pt-12 px-6">
      <div className="max-w-7xl mx-auto w-full">
        <SkeletonLoader />
      </div>
    </div>
  );

  if (!session) return <LoginPage onLogin={handleLogin} />;

  // No team — must set up immediately on first login
  if (session.role === "no_team") {
    return (
      <TeamSetupPage
        session={session}
        onTeamJoined={handleTeamJoined}
        onLogout={handleLogout}
      />
    );
  }

  if (session.is_superadmin) return <><SuperAdminDashboard session={session} onLogout={handleLogout} /><PushPrompt/></>;
  if (session.role === "teamlead") return <><TeamLeadDashboard session={session} onLogout={handleLogout} /><PushPrompt/></>;
  return <><OfficerDashboard session={session} onLogout={handleLogout} /><PushPrompt/></>;
}