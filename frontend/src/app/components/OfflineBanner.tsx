import React from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = React.useState(!navigator.onLine);

  React.useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[9999] flex justify-center pointer-events-none">
      <div
        className="m-3 px-4 py-2.5 rounded-xl flex items-center gap-2.5 shadow-lg pointer-events-auto"
        style={{ background: "#9C7B1F", color: "#FBF8F1" }}
        role="alert"
        aria-live="assertive"
      >
        <WifiOff size={14} strokeWidth={1.5} aria-hidden="true" />
        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>
          You're offline — previously loaded flashcards are still available.
        </span>
      </div>
    </div>
  );
}
