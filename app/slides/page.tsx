import SlidesClient from "./SlidesClient";

type SlidesPageProps = {
  searchParams?: {
    q?: string | string[];
  };
};

export default function Page({ searchParams }: SlidesPageProps) {
  const q = searchParams?.q;
  const initialPrompt = Array.isArray(q) ? q[0] : q;

  return <SlidesClient initialPrompt={initialPrompt?.trim() || ""} />;
}
