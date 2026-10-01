import type { Metadata } from "next";

import { VisualSearchView, visualSearchTitle } from "@/views/visual-search";

export const metadata: Metadata = { title: visualSearchTitle("en") };

export default function Page() {
  return <VisualSearchView lang="en" />;
}
