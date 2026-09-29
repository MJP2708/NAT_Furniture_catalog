import type { Metadata } from "next";

import { SearchView } from "@/views/search";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage({ searchParams }: PageProps<"/en/search">) {
  return <SearchView lang="en" searchParams={searchParams} />;
}
