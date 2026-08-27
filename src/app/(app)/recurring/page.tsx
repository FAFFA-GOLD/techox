import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ edit?: string }>;
};

export default async function RecurringPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = new URLSearchParams({ tab: "recurring" });
  if (params.edit) q.set("edit", params.edit);
  redirect(`/transactions?${q.toString()}`);
}
