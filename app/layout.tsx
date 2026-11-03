import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Traverse",
  description: "Reads a public GitHub repository and draws it as a dependency map.",
};

// Clerk's components take the same tokens as the app, so they follow the theme.
const clerkAppearance = {
  variables: {
    colorBackground: "var(--background)",
    colorForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted)",
    colorMuted: "var(--surface)",
    colorNeutral: "var(--foreground)",
    colorPrimary: "var(--foreground)",
    colorPrimaryForeground: "var(--background)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    borderRadius: "0.25rem",
    fontSize: "0.8125rem",
  },
  elements: {
    // Clerk's built-in invite can't set a destination, so its link goes to the
    // hosted Account Portal instead of this app's login page. The shell's invite
    // form is the only way to invite.
    membersPageInviteButton: { display: "none" },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The script below sets data-theme before React hydrates.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col text-xs">
        <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
