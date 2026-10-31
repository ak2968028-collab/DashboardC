import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/AuthContext";
import { DashboardProvider } from "@/components/DashboardContext";
import Shell from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Varanasi Village Environment & Carbon Dashboard",
  description: "M.Tech Thesis Project: Village-Level Environmental Resource Assessment and Carbon Emission Modeling",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <DashboardProvider>
            <Shell>{children}</Shell>
          </DashboardProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
