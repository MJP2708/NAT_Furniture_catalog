import type { Metadata } from "next";

import { SearchView } from "@/views/search";

export const metadata: Metadata = { title: "ค้นหา" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return <SearchView lang="th" searchParams={searchParams} />;
}
