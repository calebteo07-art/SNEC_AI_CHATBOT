import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FBF8F1] flex items-center justify-center px-6 py-16">
          <div
            className="w-full max-w-md bg-white rounded-2xl p-10 text-center"
            style={{
              border: "1px solid rgba(140,109,63,0.18)",
              boxShadow: "0 4px 32px rgba(31,26,18,0.07)",
            }}
          >
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-6"
              style={{
                background: "rgba(140,109,63,0.08)",
                border: "1px solid rgba(140,109,63,0.22)",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#8C6D3F"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h2
              className="text-[#1F1A12] mb-3"
              style={{
                fontFamily: "var(--font-display, Georgia, serif)",
                fontSize: "1.6rem",
                fontWeight: 400,
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
              }}
            >
              Something went wrong
            </h2>

            <p
              className="text-[#5C544A] mb-8"
              style={{ fontSize: "0.92rem", lineHeight: 1.65 }}
            >
              {this.state.error?.message || "An unexpected error occurred. Please try again."}
            </p>

            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[#1F1A12] text-[#FBF8F1] transition-opacity hover:opacity-80"
              style={{ fontWeight: 500, fontSize: "0.92rem", letterSpacing: "0.02em" }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
