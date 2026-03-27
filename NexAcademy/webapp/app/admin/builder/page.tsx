import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminBuilderRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const nextSearchParams = new URLSearchParams();

  nextSearchParams.set("section", "builder");

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (key === "section" || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        nextSearchParams.append(key, item);
      }
      continue;
    }

    nextSearchParams.set(key, value);
  }

  redirect(`/admin/campaigns?${nextSearchParams.toString()}`);
}
