import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../services/api";

const VAPID_PUBLIC_KEY = "BGh-J7kL9_H8k7uP_aF5yE_8L3yN9jQ4T_zR5vU9L1w2eJ_3qV5cZ_7sM4vX_6bA2tV_9yK_6H3rL_5nP_3tF_4=";

function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    
    if (Notification.permission === "default") {
      // Don't show immediately, wait a few seconds so we don't bombard them
      const t = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  const subscribe = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        
        const subData = JSON.parse(JSON.stringify(subscription));
        await api.post("/api/notifications/subscribe", {
          endpoint: subData.endpoint,
          p256dh: subData.keys.p256dh,
          auth: subData.keys.auth
        });
        setShow(false);
      } else {
        setShow(false);
      }
    } catch (e) {
      console.error("Failed to subscribe", e);
      setShow(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-6 max-w-sm bg-white border border-gray-200 rounded-2xl shadow-2xl p-5 z-50 animate-fade-in flex items-start gap-4">
      <div className="p-3 bg-blue-50 text-blue-600 rounded-full flex-shrink-0">
        <Bell size={24} />
      </div>
      <div>
        <h4 className="font-bold text-gray-800 text-sm">Enable Push Notifications</h4>
        <p className="text-xs text-gray-500 mt-1 mb-3">Get instant alerts when your schedule is published or a swap is approved.</p>
        <div className="flex items-center gap-2">
          <button onClick={subscribe} className="px-4 py-2 bg-[#7b1e3a] text-white text-xs font-bold rounded-lg hover:bg-[#9b2a4e] transition-colors">
            Enable
          </button>
          <button onClick={() => setShow(false)} className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
