import { useState, useEffect, useRef } from "react";
import { Bell, Loader2 } from "lucide-react";
import { fetchNotifications, markNotificationsRead, type AppNotification } from "../services/api";
import { motion, AnimatePresence } from "framer-motion";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadNotifs = () => {
    fetchNotifications().then(setNotifs).catch(() => {});
  };

  useEffect(() => {
    loadNotifs();
    const interval = setInterval(loadNotifs, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpen = async () => {
    setOpen(!open);
    if (!open) {
      // Mark as read immediately on open
      const unreadCount = notifs.filter(n => !n.is_read).length;
      if (unreadCount > 0) {
        setLoading(true);
        await markNotificationsRead().catch(() => {});
        loadNotifs();
        setLoading(false);
      }
    }
  };

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <div className="relative" ref={ref}>
      <button 
        onClick={handleOpen}
        className="relative p-2 rounded-full hover:bg-black/5 transition-colors focus:outline-none"
      >
        <Bell size={20} className="text-inherit" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-gray-800">Notifications</h3>
              {loading && <Loader2 size={14} className="animate-spin text-gray-400" />}
            </div>
            
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {notifs.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  You have no notifications.
                </div>
              ) : (
                <div className="flex flex-col">
                  {notifs.map(n => (
                    <a 
                      key={n.id}
                      href={n.link || "#"}
                      className={`p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/30' : ''}`}
                    >
                      <p className="text-sm text-gray-800">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-bold">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
