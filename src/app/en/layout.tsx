import { SiteShell, siteMetadata } from "@/components/site-shell";
import "../globals.css";

export const metadata = siteMetadata("en");

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell lang="en">{children}</SiteShell>;
}
