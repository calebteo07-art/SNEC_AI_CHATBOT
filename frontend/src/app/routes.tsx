import { createBrowserRouter, Navigate } from "react-router";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { DashboardScreen } from "./components/DashboardScreen";
import { ChatScreen } from "./components/ChatScreen";
import { CaseListScreen } from "./components/CaseListScreen";
import { CaseSessionScreen } from "./components/CaseSessionScreen";
import { FlashcardScreen } from "./components/FlashcardScreen";
import { SummaryScreen } from "./components/SummaryScreen";
import { DailyCheckInScreen } from "./components/DailyCheckInScreen";
import { SupervisorDashboard } from "./components/SupervisorDashboard";
import { AdminDashboard } from "./components/AdminDashboard";
import { ProgressScreen } from "./components/ProgressScreen";
import { CheckInGuard } from "./components/CheckInGuard";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: OnboardingScreen,
  },
  {
    path: "/checkin",
    element: (
      <CheckInGuard>
        <DailyCheckInScreen />
      </CheckInGuard>
    ),
  },
  {
    path: "/dashboard",
    element: (
      <CheckInGuard>
        <DashboardScreen />
      </CheckInGuard>
    ),
  },
  {
    path: "/supervisor",
    element: (
      <CheckInGuard>
        <SupervisorDashboard />
      </CheckInGuard>
    ),
  },
  {
    path: "/admin",
    Component: AdminDashboard,
  },
  {
    path: "/chat",
    element: (
      <CheckInGuard>
        <ChatScreen />
      </CheckInGuard>
    ),
  },
  {
    path: "/cases",
    element: (
      <CheckInGuard>
        <CaseListScreen />
      </CheckInGuard>
    ),
  },
  {
    path: "/cases/:caseId",
    element: (
      <CheckInGuard>
        <CaseSessionScreen />
      </CheckInGuard>
    ),
  },
  {
    path: "/flashcards",
    element: (
      <CheckInGuard>
        <FlashcardScreen />
      </CheckInGuard>
    ),
  },
  {
    path: "/summary",
    element: (
      <CheckInGuard>
        <SummaryScreen />
      </CheckInGuard>
    ),
  },
  {
    path: "/progress",
    element: (
      <CheckInGuard>
        <ProgressScreen />
      </CheckInGuard>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
