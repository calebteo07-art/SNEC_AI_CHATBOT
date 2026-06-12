// frontend/src/app/utils/topicIcons.tsx
import React from "react";
import type { TopicIconKey } from "./curriculum";

interface IconProps {
  size?: number;
  color?: string;
  opacity?: number;
}

const defaultProps: Required<IconProps> = { size: 24, color: "rgba(255,255,255,0.9)", opacity: 1 };

export function EyeIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <ellipse cx="14" cy="14" rx="11" ry="7" stroke={c} strokeWidth="2" />
      <circle cx="14" cy="14" r="4" fill={c} />
      <circle cx="15.5" cy="12.5" r="1.2" fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}

export function MicroscopeIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="12" y="4" width="4" height="9" rx="1" fill={c} />
      <rect x="10" y="11" width="8" height="3" rx="1.5" fill={c} opacity={0.85} />
      <path d="M14 14L14 20" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 23L19 23" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <path d="M11 23L9 20" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
      <path d="M17 23L19 20" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
      <circle cx="14" cy="7.5" r="2" fill={c} opacity={0.4} />
    </svg>
  );
}

export function DropIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <path
        d="M14 5C14 5 7 14 7 18C7 21.86 10.13 25 14 25C17.87 25 21 21.86 21 18C21 14 14 5 14 5Z"
        fill={c}
        stroke={c}
        strokeWidth="0.5"
      />
      <ellipse cx="11.5" cy="17" rx="2" ry="3.5" fill="rgba(255,255,255,0.3)" transform="rotate(-20 11.5 17)" />
    </svg>
  );
}

export function ClipboardIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="7" y="8" width="14" height="16" rx="2" stroke={c} strokeWidth="1.8" />
      <path d="M10 8V6.5C10 5.67 10.67 5 11.5 5H16.5C17.33 5 18 5.67 18 6.5V8" stroke={c} strokeWidth="1.8" fill="none" />
      <line x1="10" y1="13" x2="18" y2="13" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.7} />
      <line x1="10" y1="16.5" x2="18" y2="16.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <line x1="10" y1="20" x2="14" y2="20" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.35} />
    </svg>
  );
}

export function LightbulbIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <path
        d="M14 5C10.69 5 8 7.69 8 11C8 13.5 9.5 15.68 11.65 16.65V19C11.65 19.55 12.1 20 12.65 20H15.35C15.9 20 16.35 19.55 16.35 19V16.65C18.5 15.68 20 13.5 20 11C20 7.69 17.31 5 14 5Z"
        stroke={c} strokeWidth="1.8" fill="none"
      />
      <line x1="12" y1="21" x2="16" y2="21" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12.5" y1="23" x2="15.5" y2="23" stroke={c} strokeWidth="1.6" strokeLinecap="round" opacity={0.6} />
      <line x1="14" y1="5" x2="14" y2="3" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <line x1="20" y1="8" x2="21.5" y2="6.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <line x1="8" y1="8" x2="6.5" y2="6.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
    </svg>
  );
}

export function WaveformIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <path
        d="M3 14H6L8 7L11 20L14 10L17 17L20 12L22 14H25"
        stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export function CameraIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="3" y="9" width="22" height="15" rx="2.5" stroke={c} strokeWidth="1.8" />
      <circle cx="14" cy="16" r="4.5" stroke={c} strokeWidth="1.8" />
      <circle cx="14" cy="16" r="2" fill={c} opacity={0.5} />
      <path d="M10 9L11.5 5.5H16.5L18 9" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="21" cy="13" r="1" fill={c} opacity={0.6} />
    </svg>
  );
}

export function RulerIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="3" y="10" width="22" height="8" rx="2" stroke={c} strokeWidth="1.8" />
      <line x1="8"  y1="10" x2="8"  y2="14" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="12" y1="10" x2="12" y2="13" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="16" y1="10" x2="16" y2="14" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="20" y1="10" x2="20" y2="13" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="8" y="13" width="12" height="10" rx="2" stroke={c} strokeWidth="1.8" />
      <path d="M11 13V10C11 8.34 12.34 7 14 7C15.66 7 17 8.34 17 10V13" stroke={c} strokeWidth="1.8" fill="none" />
      <circle cx="14" cy="18" r="1.5" fill={c} />
    </svg>
  );
}

export const TOPIC_ICONS: Record<TopicIconKey, React.FC<IconProps>> = {
  eye:        EyeIcon,
  microscope: MicroscopeIcon,
  drop:       DropIcon,
  clipboard:  ClipboardIcon,
  lightbulb:  LightbulbIcon,
  waveform:   WaveformIcon,
  camera:     CameraIcon,
  ruler:      RulerIcon,
  lock:       LockIcon,
};

/** Render the correct icon for a topic icon key */
export function TopicIcon({ iconKey, size, color, opacity }: { iconKey: TopicIconKey } & IconProps) {
  const Icon = TOPIC_ICONS[iconKey];
  return <Icon size={size} color={color} opacity={opacity} />;
}
