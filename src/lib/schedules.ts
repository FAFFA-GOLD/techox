import { addMonths, startOfMonth, subMonths } from "date-fns";
import { dateOnDay } from "@/lib/money";
import type { CreditCard, CreditCardPayment, Loan, LoanPayment } from "@/lib/types";

export type CardScheduleItem = {
  id: string;
  credit_card_id: string;
  card_name: string;
  payment_date: string;
  one_time_amount: number;
  installment_amount: number;
  isProjected: boolean;
  payment_id: string | null;
};

export type LoanScheduleItem = {
  id: string;
  loan_id: string;
  loan_name: string;
  payment_date: string;
  principal_amount: number;
  interest_amount: number;
  isProjected: boolean;
  payment_id: string | null;
};

export function buildCardSchedule(
  cards: CreditCard[],
  payments: CreditCardPayment[],
  monthsBack = 0,
  monthsAhead = 18,
): CardScheduleItem[] {
  const items: CardScheduleItem[] = [];
  const confirmed = new Map(
    payments.map((p) => [`${p.credit_card_id}:${p.payment_date}`, p]),
  );
  /** 確定済みがあるカレンダー月は、予定日の自動展開を出さない（日付修正後の二重表示防止） */
  const confirmedMonths = new Set(
    payments.map((p) => `${p.credit_card_id}:${p.payment_date.slice(0, 7)}`),
  );
  let cursor = startOfMonth(subMonths(new Date(), monthsBack));
  const totalMonths = monthsBack + monthsAhead;

  for (let i = 0; i < totalMonths; i++) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    for (const card of cards) {
      const payment_date = dateOnDay(y, m, card.payment_day);
      const key = `${card.id}:${payment_date}`;
      const pay = confirmed.get(key);
      if (pay) {
        items.push({
          id: `pay-${pay.id}`,
          credit_card_id: card.id,
          card_name: card.name,
          payment_date: pay.payment_date,
          one_time_amount: pay.one_time_amount,
          installment_amount: pay.installment_amount,
          isProjected: false,
          payment_id: pay.id,
        });
      } else if (confirmedMonths.has(`${card.id}:${payment_date.slice(0, 7)}`)) {
        // 同月に別日で確定済み → 予定は出さない
      } else {
        const one = card.default_one_time_amount ?? 0;
        const inst = card.default_installment_amount ?? 0;
        if (one + inst <= 0) continue;
        items.push({
          id: `proj-${card.id}-${payment_date}`,
          credit_card_id: card.id,
          card_name: card.name,
          payment_date,
          one_time_amount: one,
          installment_amount: inst,
          isProjected: true,
          payment_id: null,
        });
      }
    }
    cursor = addMonths(cursor, 1);
  }

  for (const pay of payments) {
    if (items.some((i) => i.payment_id === pay.id)) continue;
    items.push({
      id: `pay-${pay.id}`,
      credit_card_id: pay.credit_card_id,
      card_name: pay.credit_cards?.name ?? "カード",
      payment_date: pay.payment_date,
      one_time_amount: pay.one_time_amount,
      installment_amount: pay.installment_amount,
      isProjected: false,
      payment_id: pay.id,
    });
  }

  return items.sort((a, b) => a.payment_date.localeCompare(b.payment_date));
}

export function buildLoanSchedule(
  loans: Loan[],
  payments: LoanPayment[],
  monthsBack = 3,
  monthsAhead = 18,
): LoanScheduleItem[] {
  const items: LoanScheduleItem[] = [];
  const confirmed = new Map(
    payments.map((p) => [`${p.loan_id}:${p.payment_date}`, p]),
  );
  const confirmedMonths = new Set(
    payments.map((p) => `${p.loan_id}:${p.payment_date.slice(0, 7)}`),
  );
  let cursor = startOfMonth(subMonths(new Date(), monthsBack));
  const totalMonths = monthsBack + monthsAhead;

  for (let i = 0; i < totalMonths; i++) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    for (const loan of loans) {
      const payment_date = dateOnDay(y, m, loan.payment_day);
      if (payment_date < loan.start_date) continue;
      if (loan.end_date && payment_date > loan.end_date) continue;
      const key = `${loan.id}:${payment_date}`;
      const pay = confirmed.get(key);
      if (pay) {
        items.push({
          id: `pay-${pay.id}`,
          loan_id: loan.id,
          loan_name: loan.name,
          payment_date: pay.payment_date,
          principal_amount: pay.principal_amount,
          interest_amount: pay.interest_amount,
          isProjected: false,
          payment_id: pay.id,
        });
      } else if (confirmedMonths.has(`${loan.id}:${payment_date.slice(0, 7)}`)) {
        // 同月に別日で確定済み → 予定は出さない
      } else {
        const principal = loan.principal_amount;
        const interest = loan.interest_amount;
        if (principal + interest <= 0) continue;
        items.push({
          id: `proj-${loan.id}-${payment_date}`,
          loan_id: loan.id,
          loan_name: loan.name,
          payment_date,
          principal_amount: principal,
          interest_amount: interest,
          isProjected: true,
          payment_id: null,
        });
      }
    }
    cursor = addMonths(cursor, 1);
  }

  for (const pay of payments) {
    if (items.some((i) => i.payment_id === pay.id)) continue;
    items.push({
      id: `pay-${pay.id}`,
      loan_id: pay.loan_id,
      loan_name: pay.loans?.name ?? "ローン",
      payment_date: pay.payment_date,
      principal_amount: pay.principal_amount,
      interest_amount: pay.interest_amount,
      isProjected: false,
      payment_id: pay.id,
    });
  }

  return items.sort((a, b) => a.payment_date.localeCompare(b.payment_date));
}
