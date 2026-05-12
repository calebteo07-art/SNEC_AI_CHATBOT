import React from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { MessageSquare, Stethoscope, Layers, ChevronRight, LogOut, Sparkles, Activity, Shield, Zap } from "lucide-react";
import { useAuth } from "./AuthContext";

const MODES = [
  {
    icon: MessageSquare,
    label: "Neural Chat Tutor",
    description: "Initialize cognitive exchange with AI medical protocols",
    path: "/chat",
    accent: "#00E5FF",
    glow: "rgba(0, 229, 255, 0.4)",
  },
  {
    icon: Stethoscope,
    label: "Clinical Simulation",
    description: "Deploy biometric patient scenarios for diagnostic validation",
    path: "/cases",
    accent: "#818CF8",
    glow: "rgba(129, 140, 248, 0.4)",
  },
  {
    icon: Layers,
    label: "Holographic Slates",
    description: "Access spaced-repetition data modules for memory retention",
    path: "/flashcards",
    accent: "#FFB300",
    glow: "rgba(255, 179, 0, 0.4)",
  },
];

export function DashboardScreen() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const firstName = (user?.fullName || "Student").split(" ")[0].toUpperCase();

  const [suggestion, setSuggestion] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user?.studentId) {
      fetch(`/api/study-suggestion?student_id=${user.studentId}`)
        .then((r) => r.json())
        .then((data) => setSuggestion(data.suggestion))
        .catch(() => null);
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden scanline">
      {/* Ultra-Realistic Background Anatomy (Simulated with Fundus Image & CSS) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
        <motion.div 
          className="relative w-[600px] h-[600px]"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.4 }}
          transition={{ duration: 2 }}
        >
          {/* Fundus Image Placeholder / Backdrop */}
          <div className="absolute inset-0 rounded-full overflow-hidden border-4 border-[#00E5FF]/20 shadow-[0_0_100px_rgba(0,229,255,0.2)]">
            <img 
              src="/images/sample_fundus_OD.png" 
              alt="Retinal Backdrop" 
              className="w-full h-full object-cover grayscale brightness-50 contrast-150"
            />
          </div>
          
          {/* HUD Rings */}
          <motion.div 
            className="absolute -inset-10 border border-[#00E5FF]/10 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          />
          <motion.div 
            className="absolute -inset-20 border border-dashed border-[#00E5FF]/5 rounded-full"
            animate={{ rotate: -360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          />

          {/* Diagnostic Lines (SVG) */}
          <svg className="absolute inset-0 w-full h-full overflow-visible">
            <motion.path 
              d="M 300 300 L 700 100" 
              stroke="#00E5FF" 
              strokeWidth="1" 
              strokeDasharray="5,5"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, repeat: Infinity }}
            />
             <motion.path 
              d="M 300 300 L 700 500" 
              stroke="#00E5FF" 
              strokeWidth="1" 
              strokeDasharray="5,5"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
            />
          </svg>
        </motion.div>
      </div>

      <motion.div
        className="w-full max-w-4xl relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        {/* Left Sidebar HUD */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-[#00E5FF]">
            <div className="flex items-center gap-4 mb-6">
              <HolographicEyeLogo size={50} animated />
              <div>
                <h1 className="text-[#00E5FF] font-black text-xl tracking-tighter">
                  {firstName}
                </h1>
                <p className="text-white/40 text-[0.5rem] uppercase tracking-[0.3em] font-mono">
                  Subject_Status: Online
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center text-[0.6rem] font-mono">
                <span className="text-white/40 uppercase">Neural_Load</span>
                <span className="text-[#00E5FF]">64%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-[#00E5FF]" 
                  initial={{ width: 0 }}
                  animate={{ width: "64%" }}
                />
              </div>
              
              <div className="flex justify-between items-center text-[0.6rem] font-mono">
                <span className="text-white/40 uppercase">Sync_Quality</span>
                <span className="text-[#39FF14]">98.2%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-[#39FF14]" 
                  initial={{ width: 0 }}
                  animate={{ width: "98.2%" }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-3 py-4 glass-panel rounded-xl text-white/40 hover:text-red-500 hover:border-red-500/30 transition-all uppercase text-[0.7rem] tracking-[0.2em] font-mono"
          >
            <LogOut size={16} />
            Terminate Link
          </button>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-[#00E5FF]/60 text-[0.6rem] uppercase tracking-[0.4em] font-mono mb-1">
                Command_Interface_v2.0
              </p>
              <h2 className="text-white text-3xl font-black uppercase tracking-tight">
                Core Interface
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <Activity size={18} className="text-[#39FF14]" />
              <div className="text-right">
                <p className="text-white/20 text-[0.5rem] uppercase font-mono">Uptime</p>
                <p className="text-white text-[0.7rem] font-mono">142:04:12</p>
              </div>
            </div>
          </div>

          {/* AI Suggestion HUD */}
          {suggestion && (
            <motion.div
              className="glass-panel p-6 rounded-2xl border border-[#00E5FF]/20 relative overflow-hidden"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-[#00E5FF]" />
              <div className="flex gap-4">
                <div className="mt-1">
                  <Zap size={20} className="text-[#00E5FF] animate-pulse" />
                </div>
                <div>
                  <p className="text-[#00E5FF] text-[0.6rem] uppercase tracking-widest font-mono mb-2">
                    Predictive_Study_Algorithm
                  </p>
                  <p className="text-white/80 text-sm leading-relaxed italic">
                    "{suggestion}"
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Mode Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MODES.map(({ icon: Icon, label, description, path, accent, glow }, i) => (
              <motion.button
                key={path}
                onClick={() => navigate(path)}
                className="glass-panel p-6 rounded-3xl text-left group relative overflow-hidden transition-all hover:border-[#00E5FF]/40"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                whileHover={{ y: -4, shadow: `0 0 30px ${glow}` }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div 
                    className="w-12 h-12 rounded-2xl flex items-center justify-center border border-white/10 group-hover:border-[#00E5FF]/40 transition-colors"
                    style={{ background: `radial-gradient(circle, ${accent}15 0%, transparent 70%)` }}
                  >
                    <Icon size={24} style={{ color: accent }} />
                  </div>
                  <ChevronRight size={18} className="text-white/10 group-hover:text-[#00E5FF] transition-colors" />
                </div>
                <h3 className="text-white font-black uppercase tracking-tighter text-lg mb-2 group-hover:text-[#00E5FF] transition-colors">
                  {label}
                </h3>
                <p className="text-white/40 text-[0.7rem] leading-relaxed font-mono">
                  {description}
                </p>
                
                {/* HUD Corner Decor */}
                <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-white/5" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-white/5" />
              </motion.button>
            ))}
            
            {/* System Status Mock Panel */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-white/[0.01] flex flex-col justify-center items-center">
              <Shield size={32} className="text-white/5 mb-3" />
              <p className="text-white/10 text-[0.5rem] uppercase tracking-[0.5em] font-mono text-center">
                Security_Protocol_Active
                <br />
                Encrypted_Session
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Footer Info */}
      <div className="mt-12 text-center relative z-10">
        <p className="text-white/10 text-[0.5rem] uppercase tracking-[1em] font-mono">
          © 2026 EyeQ Medical Neural Interface
        </p>
      </div>
    </div>
  );
}
