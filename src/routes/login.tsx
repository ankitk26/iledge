import { SpinnerIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import GithubIcon from "@/components/login/github-icon";
import GoogleIcon from "@/components/login/google-icon";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

type Provider = "github" | "google";

function SocialLoginButton({
	provider,
	label,
	icon,
}: {
	provider: Provider;
	label: string;
	icon: React.ReactNode;
}) {
	const [isLoading, setIsLoading] = useState(false);

	return (
		<Button
			className="w-60"
			size="lg"
			disabled={isLoading}
			onClick={async () => {
				setIsLoading(true);
				await authClient.signIn.social({
					provider,
					callbackURL: "/",
				});
			}}
		>
			{isLoading ? (
				<SpinnerIcon className="animate-spin" />
			) : (
				<>
					{icon}
					{label}
				</>
			)}
		</Button>
	);
}

function LoginPage() {
	return (
		<div className="flex h-screen flex-col items-center justify-center py-12">
			<div className="flex flex-col items-center space-y-8 rounded-none border p-10">
				<h2 className="text-2xl font-bold">Log in</h2>

				<div className="flex flex-col gap-3">
					<SocialLoginButton
						provider="google"
						label="Sign in with Google"
						icon={<GoogleIcon />}
					/>
					<SocialLoginButton
						provider="github"
						label="Sign in with Github"
						icon={<GithubIcon />}
					/>
				</div>

				<p className="max-w-[15rem] text-center text-xs text-muted-foreground">
					Google sign-in is required to load expenses from Gmail.
				</p>
			</div>
		</div>
	);
}
