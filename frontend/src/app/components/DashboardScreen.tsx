import React from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import {
  MessageSquare,
  Stethoscope,
  Layers,
  ChevronRight,
  LogOut,
  Activity,
  Shield,
  Zap,
} from "lucide-react";
import { useAuth } from "./AuthContext";

const MODES = [
  {
    icon: MessageSquare,
    label: "Neural Chat",
    sub: "Cognitive_Exchange",
    description: "Initialize Socratic dialogue with the AI medical protocol",
    path: "/chat",
    accent: "#00E5FF",
    glow: "rgba(0, 229, 255, 0.4)",
  },
  {
    icon: Stethoscope,
    label: "Clinical Sim",
    sub: "Patient_Scenario",
    description: "Deploy biometric patient cases for diagnostic validation",
    path: "/cases",
    accent: "#39FF14",
    glow: "rgba(57, 255, 20, 0.4)",
  },
  {
    icon: Layers,
    label: "Memory Slates",
    sub: "Spaced_Repetition",
    description: "Access holographic data modules for long-term retention",
    path: "/flashcards",
    accent: "#FFB300",
    glow: "rgba(255, 179, 0, 0.4)",
  },
];

// Anatomical callouts — coordinates over a 600×600 eye disc centered at (300,300)
const ANATOMY_CALLOUTS = [
  {
    label: "Optic_Disc",
    note: "vascular convergence",
    point: { x: 220, y: 270 },
    label_pos: { x: 60, y: 180 },
    accent: "#00E5FF",
  },
  {
    label: "Macula",
    note: "central vision",
    point: { x: 340, y: 310 },
    label_pos: { x: 520, y: 260 },
    accent: "#39FF14",
  },
  {
    label: "Retinal_Vessel",
    note: "tortuous superior",
    point: { x: 280, y: 180 },
    label_pos: { x: 480, y: 80 },
    accent: "#FFB300",
  },
  {
    label: "Vitreous_Body",
    note: "transparent gel",
    point: { x: 360, y: 430 },
    label_pos: { x: 520, y: 500 },
    accent: "#00E5FF",
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
      {/* ===== Anatomical Backdrop ===== */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-pattern opacity-30" />

        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.55 }}
          transition={{ duration: 2 }}
        >
          {/* Master anatomy SVG canvas */}
          <svg
            width="900"
            height="700"
            viewBox="0 0 900 700"
            className="overflow-visible"
          >
            {/* Outer rotating HUD rings */}
            <motion.g
              style={{ transformOrigin: "450px 350px" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            >
              <circle
                cx="450"
                cy="350"
                r="320"
                fill="none"
                stroke="rgba(0,229,255,0.08)"
                strokeWidth="1"
                strokeDasharray="2 8"
              />
            </motion.g>
            <motion.g
              style={{ transformOrigin: "450px 350px" }}
              animate={{ rotate: -360 }}
              transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
            >
              <circle
                cx="450"
                cy="350"
                r="370"
                fill="none"
                stroke="rgba(0,229,255,0.05)"
                strokeWidth="1"
              />
            </motion.g>

            {/* Anatomical callouts */}
            {ANATOMY_CALLOUTS.map((c, i) => {
              const px = c.point.x + 150; // offset for svg viewbox center
              const py = c.point.y + 50;
              const lx = c.label_pos.x + 150;
              const ly = c.label_pos.y + 50;
              return (
                <g key={c.label}>
                  {/* Dashed connector line */}
                  <motion.line
                    x1={px}
                    y1={py}
                    x2={lx}
                    y2={ly}
                    stroke={c.accent}
                    strokeWidth="1"
                    strokeDasharray="3 4"
                    strokeOpacity="0.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      duration: 1.5,
                      delay: 1.2 + i * 0.2,
                      ease: "easeOut",
                    }}
                  />
                  {/* Anchor dot at anatomical point */}
                  <motion.circle
                    cx={px}
                    cy={py}
                    r="3"
                    fill={c.accent}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 1.2 + i * 0.2 }}
                  >
                    <animate
                      attributeName="opacity"
                      values="1;0.4;1"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </motion.circle>
                  <circle
                    cx={px}
                    cy={py}
                    r="8"
                    fill="none"
                    stroke={c.accent}
                    strokeWidth="1"
                    strokeOpacity="0.3"
                  />

                  {/* Label endpoint marker */}
                  <motion.circle
                    cx={lx}
                    cy={ly}
                    r="2"
                    fill={c.accent}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 1.8 + i * 0.2 }}
                  />

                  {/* Label text — pure SVG so it inherits the perspective */}
                  <motion.g
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2 + i * 0.15 }}
                  >
                    <text
                      x={lx + (lx > 450 ? 12 : -12)}
                      y={ly - 4}
                      fill={c.accent}
                      fontSize="9"
                      fontFamily="'JetBrains Mono', monospace"
                      fontWeight="700"
                      letterSpacing="2"
                      textAnchor={lx > 450 ? "start" : "end"}
                      style={{ textShadow: `0 0 8px ${c.accent}` }}
                    >
                      {c.label.toUpperCase()}
                    </text>
                    <text
                      x={lx + (lx > 450 ? 12 : -12)}
                      y={ly + 8}
                      fill="rgba(255,255,255,0.5)"
                      fontSize="7"
                      fontFamily="'JetBrains Mono', monospace"
                      letterSpacing="1.5"
                      textAnchor={lx > 450 ? "start" : "end"}
                    >
                      // {c.note}
                    </text>
                  </motion.g>
                </g>
              );
            })}
          </svg>

          {/* The eye fundus image — centered behind the SVG */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full overflow-hidden border-2 border-[#00E5FF]/15 shadow-[0_0_120px_rgba(0,229,255,0.25)]">
            <img
              src="/images/sample_fundus_OD.png"
              alt=""
              className="w-full h-full object-cover grayscale brightness-[0.45] contrast-[1.4]"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
              }}
            />
          </div>
        </motion.div>
      </div>

      <motion.div
        className="w-full max-w-5xl relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        {/* ===== Left Sidebar HUD ===== */}
        <div className="lg:col-span-4 space-y-5">
          <div className="glass-panel p-6 rounded-2xl border-l-2 border-l-[#00E5FF] hud-corners relative overflow-hidden">
            <motion.div
              className="absolute top-0 left-0 h-px w-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, #00E5FF 50%, transparent)",
              }}
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
            <div className="flex items-center gap-4 mb-6">
              <HolographicEyeLogo size={50} animated />
              <div>
                <h1
                  className="text-[#00E5FF] font-black tracking-tight glow-text-teal"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.15rem",
                  }}
                >
                  {firstName}
                </h1>
                <p className="text-white/40 text-[0.55rem] uppercase tracking-[0.35em] font-mono">
                  Subject_Status :: <span className="text-[#39FF14]">online</span>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-[0.6rem] font-mono">
                <span className="text-white/40 uppercase tracking-[0.2em]">
                  Neural_Load
                </span>
                <span className="text-[#00E5FF] glow-text-teal">64%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[#00E5FF]"
                  initial={{ width: 0 }}
                  animate={{ width: "64%" }}
                  transition={{ duration: 1.5, delay: 0.5 }}
                  style={{ boxShadow: "0 0 10px #00E5FF" }}
                />
              </div>

              <div className="flex justify-between items-center text-[0.6rem] font-mono">
                <span className="text-white/40 uppercase tracking-[0.2em]">
                  Sync_Quality
                </span>
                <span className="text-[#39FF14] glow-text-green">98.2%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[#39FF14]"
                  initial={{ width: 0 }}
                  animate={{ width: "98.2%" }}
                  transition={{ duration: 1.5, delay: 0.7 }}
                  style={{ boxShadow: "0 0 10px #39FF14" }}
                />
              </div>

              <div className="flex justify-between items-center text-[0.6rem] font-mono">
                <span className="text-white/40 uppercase tracking-[0.2em]">
                  Acuity_Index
                </span>
                <span className="text-[#FFB300] glow-text-amber">82%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[#FFB300]"
                  initial={{ width: 0 }}
                  animate={{ width: "82%" }}
                  transition={{ duration: 1.5, delay: 0.9 }}
                  style={{ boxShadow: "0 0 10px #FFB300" }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-3 py-4 glass-panel rounded-xl text-white/40 hover:text-[#FF3D00] hover:border-[#FF3D00]/30 transition-all uppercase text-[0.65rem] tracking-[0.3em] font-mono group"
          >
            <LogOut size={14} className="group-hover:translate-x-0.5 transition-transform" />
            Terminate_Link
          </button>
        </div>

        {/* ===== Main Content Area ===== */}
        <div className="lg:col-span-8 space-y-5">
          {/* Header */}
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-[#00E5FF]/60 text-[0.55rem] uppercase tracking-[0.45em] font-mono mb-1">
                Command_Interface_v2.0
              </p>
              <h2
                className="text-white uppercase tracking-tight glow-text-teal"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.8rem",
                  fontWeight: 900,
                }}
              >
                Core_Interface
              </h2>
            </div>
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
              <Activity size={14} className="text-[#39FF14] hud-blink" />
              <div className="text-right">
                <p className="text-white/30 text-[0.5rem] uppercase font-mono tracking-widest">
                  Uptime
                </p>
                <p
                  className="text-white text-[0.7rem] font-mono tracking-widest"
                >
                  142:04:12
                </p>
              </div>
            </div>
          </div>

          {/* AI Suggestion HUD */}
          {suggestion && (
            <motion.div
              className="glass-panel p-5 rounded-2xl border border-[#00E5FF]/20 relative overflow-hidden hud-corners"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div
                className="absolute top-0 left-0 w-1 h-full bg-[#00E5FF]"
                style={{ boxShadow: "0 0 12px #00E5FF" }}
              />
              <div className="flex gap-4">
                <div className="mt-1">
                  <Zap size={18} className="text-[#00E5FF] hud-blink" />
                </div>
                <div>
                  <p className="text-[#00E5FF] text-[0.55rem] uppercase tracking-[0.35em] font-mono mb-2 glow-text-teal">
                    Predictive_Study_Algorithm
                  </p>
                  <p
                    className="text-white/80 leading-relaxed italic"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.78rem",
                      lineHeight: 1.65,
                    }}
                  >
                    "{suggestion}"
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Mode Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MODES.map(({ icon: Icon, label, sub, description, path, accent, glow }, i) => (
              <motion.button
                key={path}
                onClick={() => navigate(path)}
                className="glass-panel p-5 rounded-2xl text-left group relative overflow-hidden transition-all hud-corners"
                style={{ borderColor: `${accent}25` }}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                whileHover={{ y: -3, boxShadow: `0 0 30px ${glow}` }}
              >
                {/* Color accent bar */}
                <div
                  className="absolute top-0 left-0 w-full h-px"
                  style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
                />

                <div className="flex items-center justify-between mb-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center border border-white/10 group-hover:border-white/20 transition-colors"
                    style={{
                      background: `radial-gradient(circle, ${accent}25 0%, transparent 70%)`,
                    }}
                  >
                    <Icon size={20} style={{ color: accent }} />
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-white/10 group-hover:translate-x-1 transition-all"
                    style={{ color: undefined }}
                  />
                </div>
                <h3
                  className="text-white font-black uppercase tracking-tight text-base mb-0.5 transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {label}
                </h3>
                <p
                  className="text-[0.5rem] uppercase tracking-[0.3em] font-mono mb-2"
                  style={{ color: accent }}
                >
                  {sub}
                </p>
                <p
                  className="text-white/45 leading-relaxed"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    lineHeight: 1.55,
                  }}
                >
                  {description}
                </p>
              </motion.button>
            ))}

            {/* System Status Mock Panel */}
            <div className="glass-panel p-5 rounded-2xl border border-white/5 bg-white/[0.01] flex flex-col justify-center items-center hud-corners">
              <Shield size={28} className="text-white/10 mb-3" />
              <p className="text-white/15 text-[0.5rem] uppercase tracking-[0.45em] font-mono text-center leading-relaxed">
                Security_Protocol_Active
                <br />
                <span className="text-[#39FF14]/40">Encrypted_Session</span>
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Footer */}
      <div className="mt-10 text-center relative z-10">
        <p className="text-white/15 text-[0.5rem] uppercase tracking-[1em] font-mono">
          © 2026 EyeQ Medical Neural Interface
        </p>
      </div>
    </div>
  );
}
