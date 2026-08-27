import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{
    edit?: string;
    editPayment?: string;
    confirmLoan?: string;
    confirmDate?: string;
    loan?: string;
  }>;
};

export default async function LoansPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = new URLSearchParams({ tab: "loans" });
  if (params.edit) q.set("edit", params.edit);
  if (params.editPayment) q.set("editPayment", params.editPayment);
  if (params.confirmLoan) q.set("confirmLoan", params.confirmLoan);
  if (params.confirmDate) q.set("confirmDate", params.confirmDate);
  if (params.loan) q.set("loan", params.loan);
  redirect(`/transactions?${q.toString()}`);
}
