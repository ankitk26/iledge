import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "@/db";
import { user, session, account, verification } from "@/db/auth-schema";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user,
			session,
			account,
			verification,
		},
	}),

	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // Cache duration in seconds
		},
		expiresIn: 2 * 60 * 60,
		updateAge: 60 * 30,
	},

	rateLimit: {
		window: 60, // 1 minute
		max: 20, // 20 requests per minute
	},

	user: {
		modelName: "user",
		additionalFields: {
			role: {
				type: "string",
				nullable: false,
			},
		},
	},

	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		},
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
			accessType: "offline",
			prompt: "consent",
			scope: ["https://www.googleapis.com/auth/gmail.readonly"],
		},
	},
	plugins: [tanstackStartCookies()],
});
