import { useSuspenseQuery } from "@tanstack/react-query";
import { queries } from "@/queries";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export default function User() {
	const { data } = useSuspenseQuery(queries.users.me);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button type="button" className="rounded-none">
						<Avatar className="size-9">
							<AvatarImage src={data?.image ?? ""} alt={data?.name} />
							<AvatarFallback>**</AvatarFallback>
						</Avatar>
					</button>
				}
			/>
			<DropdownMenuContent align="end" className="w-64 min-w-64">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-sm font-medium text-foreground">
						{data?.name}
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="truncate" title={data?.email ?? ""}>
						{data?.email}
					</DropdownMenuLabel>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
