import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { loadExpensesGmailApi } from "@/server-fns/load-expenses-gmail-api";
import { Button } from "../ui/button";

export default function LoadExpensesButton() {
	const queryClient = useQueryClient();

	const loadExpensesMutation = useMutation({
		mutationFn: () => loadExpensesGmailApi(),
		onSuccess: async (data) => {
			await queryClient.invalidateQueries();
			toast.success(data?.message ?? "Load successful");
		},
		onError: async () => {
			toast.error("Load unsuccessful", {
				description: "Something went wrong. Try again later",
			});
			await queryClient.invalidateQueries();
		},
	});

	return (
		<Button
			size="icon"
			variant="outline"
			onClick={() => loadExpensesMutation.mutate()}
			disabled={loadExpensesMutation.isPending}
			className="w-full lg:size-9"
		>
			{loadExpensesMutation.isPending ? (
				<ArrowsClockwiseIcon className="animate-spin" />
			) : (
				<ArrowsClockwiseIcon />
			)}
		</Button>
	);
}
