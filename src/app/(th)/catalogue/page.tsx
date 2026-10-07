import type { Metadata } from "next";

import { OfficeContentsView } from "@/views/office-catalogue";

export const metadata: Metadata = { title: "แคตตาล็อกเฟอร์นิเจอร์" };

export default function OfficeCataloguePage() {
  return <OfficeContentsView lang="th" />;
}
