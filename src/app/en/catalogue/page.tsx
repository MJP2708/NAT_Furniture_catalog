import type { Metadata } from "next";

import { OfficeContentsView } from "@/views/office-catalogue";

export const metadata: Metadata = { title: "Furniture E-Catalogue" };

export default function OfficeCataloguePage() {
  return <OfficeContentsView lang="en" />;
}
