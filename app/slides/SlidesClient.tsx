"use client";

import Slides from "@/pages-legacy/Slides";

type SlidesClientProps = {
  initialPrompt?: string;
};

export default function SlidesClient({ initialPrompt = "" }: SlidesClientProps) {
  return <Slides initialPrompt={initialPrompt} />;
}
