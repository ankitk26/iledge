import { WarningIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { formatAmount } from "@/lib/format-amount";
import { queries } from "@/queries";
import { CardContent, CardFooter } from "../ui/card";

const BUDGET = 30000;

export default function CurrMonthExpensesData() {
	const { data } = useSuspenseQuery(queries.expenses.currentAndPreviousMonth);

	const previousMonthAmount = data[0].previousMonthSpent;
	const currentMonthAmount = data[0].currentMonthSpent;

	const budgetPercent = Number(
		((currentMonthAmount / BUDGET) * 100).toFixed(2),
	);

	const isOverBudget = currentMonthAmount > BUDGET;
	const isNearBudget = !isOverBudget && budgetPercent >= 80;

	return (
		<>
			<CardContent>
				<p
					className={`text-3xl ${
						isOverBudget
							? "text-destructive"
							: isNearBudget
								? "text-amber-600 dark:text-amber-400"
								: ""
					}`}
				>
					{formatAmount(currentMonthAmount)}
				</p>
			</CardContent>
			<CardFooter className="flex flex-col items-start text-xs text-muted-foreground">
				<p
					className={`flex items-center gap-1 ${
						isOverBudget ? "font-medium text-destructive" : ""
					}`}
				>
					{isOverBudget && <WarningIcon className="size-3.5" aria-hidden />}
					{budgetPercent}% budget used
					{isOverBudget &&
						` — ${formatAmount(currentMonthAmount - BUDGET)} over`}
				</p>
				<p>Last month's expenses = {formatAmount(previousMonthAmount)}</p>
			</CardFooter>
		</>
	);
}
