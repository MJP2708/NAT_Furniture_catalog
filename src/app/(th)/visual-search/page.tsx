import type { Metadata } from "next";

import { VisualSearchView, visualSearchTitle } from "@/views/visual-search";

export const metadata: Metadata = { title: visualSearchTitle("th") };

export default function Page() {
  return <VisualSearchView lang="th" />;
}
