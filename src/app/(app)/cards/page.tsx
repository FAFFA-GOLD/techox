import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{
    editCard?: string;
    editPayment?: string;
    confirmCard?: string;
    confirmDate?: string;
    card?: string;
  }>;
};

export default async function CardsPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = new URLSearchParams({ tab: "cards" });
  if (params.editCard) q.set("editCard", params.editCard);
  if (params.editPayment) q.set("editPayment", params.editPayment);
  if (params.confirmCard) q.set("confirmCard", params.confirmCard);
  if (params.confirmDate) q.set("confirmDate", params.confirmDate);
  if (params.card) q.set("card", params.card);
  redirect(`/transactions?${q.toString()}`);
}
