import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "./components/AppShell";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { DashboardScreen } from "./components/DashboardScreen";
import { ChatScreen } from "./components/ChatScreen";
import { CaseListScreen } from "./components/CaseListScreen";
import { CaseSessionScreen } from "./components/CaseSessionScreen";
import { FlashcardScreen } from "./components/FlashcardScreen";
import { SummaryScreen } from "./components/SummaryScreen";
import { DailyCheckInScreen } from "./components/DailyCheckInScreen";
import { SupervisorDashboard } from "./components/SupervisorDashboard";
import { AdminLayout } from "./components/AdminLayout";
import { AdminOverviewPage } from "./components/AdminOverviewPage";
import { AdminStudentsPage } from "./components/AdminStudentsPage";
import { AdminAccountsPage } from "./components/AdminAccountsPage";
import { AdminActivityPage } from "./components/AdminActivityPage";
import { ProgressScreen } from "./components/ProgressScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { CheckInGuard } from "./components/CheckInGuard";
import { AdminGuard } from "./components/AdminGuard";

export const router = createBrowserRouter([
  /* Login — no shell */
  {
    path: "/",
    Component: OnboardingScreen,
  },

  /* Check-in — full screen, no shell */
  {
    path: "/checkin",
    element: (
      <CheckInGuard>
        <DailyCheckInScreen />
      </CheckInGuard>
    ),
  },

  /* All authenticated routes share AppShell (sidebar + topbar) */
  {
    element: <AppShell />,
    children: [
      {
        path: "/dashboard",
        element: (
          <CheckInGuard>
            <DashboardScreen />
          </CheckInGuard>
        ),
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
        path: "/supervisor",
        element: (
          <CheckInGuard>
            <SupervisorDashboard />
          </CheckInGuard>
        ),
      },
      {
        path: "/admin",
        element: (
          <AdminGuard>
            <AdminLayout />
          </AdminGuard>
        ),
        children: [
          { index: true,          element: <AdminOverviewPage /> },
          { path: "students",     element: <AdminStudentsPage /> },
          { path: "accounts",     element: <AdminAccountsPage /> },
          { path: "activity",     element: <AdminActivityPage /> },
        ],
      },
      {
        path: "/profile",
        element: (
          <CheckInGuard>
            <ProfileScreen />
          </CheckInGuard>
        ),
      },
    ],
  },

  { path: "*", element: <Navigate to="/" replace /> },
]);
