import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ edit?: string }>;
};

export default async function CategoriesPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = new URLSearchParams({ tab: "categories" });
  if (params.edit) q.set("edit", params.edit);
  redirect(`/transactions?${q.toString()}`);
}
