import { Link, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import HeaderSheetMenu from "./header-sheet-menu";
import LoadExpensesButton from "./load-expenses-button";
import ThemeToggle from "./theme-toggle";
import User from "./user";

export default function Header() {
	const navigate = useNavigate();

	return (
		<header className="sticky top-0 z-50 mx-auto w-11/12 border-b bg-background/70 py-4 backdrop-blur-md lg:w-5/6">
			<nav className="flex items-center justify-between gap-8 text-sm">
				<Link to="/" className="text-xl font-semibold">
					iledge
				</Link>
				<div className="hidden space-x-6 lg:flex">
					<Link
						to="/expenses"
						className="hover:text-foreground/70 hover:underline"
					>
						Expenses
					</Link>
					<Link
						to="/insights"
						className="hover:text-foreground/70 hover:underline"
					>
						Insights
					</Link>
					<Link
						to="/admin"
						className="hover:text-foreground/70 hover:underline"
					>
						Admin
					</Link>
					<Link
						to="/search"
						className="hover:text-foreground/70 hover:underline"
					>
						Search
					</Link>
				</div>
				<div className="hidden items-center gap-2 lg:flex">
					<LoadExpensesButton />
					<ThemeToggle />
					<Suspense fallback={<Skeleton className="size-9 rounded-none" />}>
						<User />
					</Suspense>
					<Button
						className="ml-2"
						onClick={async () => {
							await authClient.signOut();
							navigate({ to: "/login" });
						}}
					>
						Log out
					</Button>
				</div>

				<HeaderSheetMenu />
			</nav>
		</header>
	);
}
