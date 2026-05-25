import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { type UserSession } from "../services/api";
import { motion, AnimatePresence } from "framer-motion";

type Message = {
  type: string;
  user: string;
  text: string;
  timestamp: string;
};

type Props = {
  session: UserSession;
};

export default function ChatPanel({ session }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !session.team_id) return;

    // Connect to WebSocket
    const wsUrl = `ws://localhost:8000/api/chat/ws/${session.team_id}?token=${session.token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages((prev) => [...prev, data]);
      } catch (e) {
        console.error("Invalid WS message", event.data);
      }
    };

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [isOpen, session.team_id, session.token]);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !wsRef.current) return;
    
    wsRef.current.send(input.trim());
    setInput("");
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#7b1e3a] text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform z-40"
      >
        <MessageCircle size={24} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-24 right-6 w-80 md:w-96 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
            style={{ height: "500px", maxHeight: "80vh" }}
          >
            <div className="bg-[#7b1e3a] p-4 flex items-center justify-between text-white">
              <div>
                <h3 className="font-bold text-sm">Team Chat</h3>
                <p className="text-[10px] opacity-80 uppercase tracking-widest">{session.team_name}</p>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1.5 rounded-full transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <MessageCircle size={32} className="mb-2 opacity-50" />
                  <p className="text-xs font-semibold">No messages yet.</p>
                  <p className="text-[10px]">Send a message to start negotiating swaps!</p>
                </div>
              )}
              {messages.map((m, i) => {
                const isMe = m.user === session.display_name;
                return (
                  <div key={i} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    {!isMe && <span className="text-[10px] font-bold text-gray-500 ml-1 mb-0.5">{m.user}</span>}
                    <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${isMe ? "bg-[#7b1e3a] text-white rounded-tr-sm" : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"}`}>
                      {m.text}
                    </div>
                    <span className="text-[9px] text-gray-400 mt-1 mx-1">
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={sendMessage} className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
              <input 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7b1e3a]/50 transition-all"
              />
              <button 
                type="submit" 
                disabled={!input.trim()}
                className="w-10 h-10 rounded-full bg-[#7b1e3a] text-white flex items-center justify-center disabled:opacity-50 hover:bg-[#9b2a4e] transition-colors"
              >
                <Send size={16} className="ml-0.5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
