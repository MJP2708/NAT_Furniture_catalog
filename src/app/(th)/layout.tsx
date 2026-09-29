import { SiteShell, siteMetadata } from "@/components/site-shell";
import "../globals.css";

export const metadata = siteMetadata("th");

export default function ThaiLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell lang="th">{children}</SiteShell>;
}
