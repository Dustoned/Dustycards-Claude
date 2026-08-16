import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MarktplaatsDealsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; match?: string; q?: string }>;
}) {
  const legacy = await searchParams;
  const params = new URLSearchParams({ tab: "selling", sellingView: "marktplaats" });
  if (legacy.kind) params.set("dealKind", legacy.kind);
  if (legacy.match === "review") params.set("dealMatch", "review");
  if (legacy.q) params.set("dealQ", legacy.q);
  redirect(`/?${params.toString()}`);
}
