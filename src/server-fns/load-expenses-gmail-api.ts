import { createServerFn } from "@tanstack/react-start";
import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { and, eq, max, sql } from "drizzle-orm";
import { account } from "@/db/auth-schema";
import { db } from "@/db";
import { expense, payee } from "@/db/schema";
import { getUser } from "./get-user";

/*
 * Gmail API expense loader.
 *
 * Each user signs in with Google. better-auth stores the user's Google
 * refresh_token in the `account` table. This loader reads that token,
 * fetches the user's own Gmail, and extracts UPI expenses.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   CHECK_MAIL        (sender email to filter bank notifications)
 *   IDS               (comma-separated UPI IDs for "paid to me" detection)
 */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type ParsedMail = {
	upi_ref_no: string;
	sender_upi_id: string;
	payee_upi_id: string;
	name: string;
	amount: string;
	transaction_date: Date;
};

type NewPayee = Pick<ParsedMail, "payee_upi_id" | "name"> & { user_id: string };

type GmailMessage = {
	id: string;
	internalDate: string;
	payload?: {
		mimeType?: string;
		body?: { data?: string };
		parts?: GmailMessage["payload"][];
	};
};

type LoadResult = { message: string };

// -----------------------------------------------------------------------------
// Pure helpers (no side effects, no external IO)
// -----------------------------------------------------------------------------

function base64UrlDecode(input: string): string {
	const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(
		normalized.length + ((4 - (normalized.length % 4)) % 4),
		"=",
	);
	return Buffer.from(padded, "base64").toString("utf-8");
}

function getHtmlBody(payload?: GmailMessage["payload"]): string {
	if (!payload) return "";

	if (payload.mimeType === "text/html" && payload.body?.data) {
		return base64UrlDecode(payload.body.data);
	}

	if (payload.parts) {
		for (const part of payload.parts) {
			const found = getHtmlBody(part);
			if (found) return found;
		}
	}

	return "";
}

function getMessageReceivedAt(message: GmailMessage): Date {
	return new Date(Number(message.internalDate));
}

function parseExpenseLines(lines: string[]): Partial<ParsedMail> {
	const currentMailData: Partial<ParsedMail> = {};

	const filteredLines = lines
		.map((line) => line.trim())
		.filter((line) => line.includes(":") && !line.startsWith("<"));

	for (const line of filteredLines) {
		const [key, val] = line.split(":", 2).map((s) => s.trim());

		switch (key) {
			case "UPI Ref. No.":
				currentMailData.upi_ref_no = val;
				break;
			case "From VPA":
				currentMailData.sender_upi_id = val;
				break;
			case "To VPA":
				currentMailData.payee_upi_id = val;
				break;
			case "Payee Name":
				currentMailData.name = val;
				break;
			case "Amount":
				currentMailData.amount = val;
				break;
		}
	}

	return currentMailData;
}

function isValidParsedMail(data: Partial<ParsedMail>): data is ParsedMail {
	return (
		!!data.upi_ref_no &&
		!!data.sender_upi_id &&
		!!data.payee_upi_id &&
		!!data.name &&
		!!data.transaction_date &&
		!!data.amount
	);
}

function isRelevantSpan(spanText: string): boolean {
	return (
		spanText.includes("UPI Ref. No.") &&
		!spanText.includes("Transaction Status: FAILED")
	);
}

function invertAmountIfPaidToMe(
	mail: ParsedMail,
	userIds: string[],
): ParsedMail {
	const isPaidToMe = userIds.some((id) => mail.payee_upi_id.includes(id));

	if (isPaidToMe) {
		return { ...mail, amount: `-${mail.amount}` };
	}

	return mail;
}

function parseMailSpan(
	span: Cheerio<AnyNode>,
	receivedAt: Date,
	userIds: string[],
): ParsedMail | null {
	const spanText = span.text();

	if (!isRelevantSpan(spanText)) {
		return null;
	}

	const html = span.html() ?? "";
	const lines = html.split("<br>");
	const currentMailData = parseExpenseLines(lines);
	currentMailData.transaction_date = receivedAt;

	if (!isValidParsedMail(currentMailData)) {
		return null;
	}

	return invertAmountIfPaidToMe(currentMailData, userIds);
}

function parseMessage(
	message: GmailMessage,
	userIds: string[],
): ParsedMail[] {
	const html = getHtmlBody(message.payload);
	const receivedAt = getMessageReceivedAt(message);
	const $ = cheerio.load(html);
	const spans = $("span.gmailmsg");
	const parsedMails: ParsedMail[] = [];

	spans.each((_, element) => {
		const mail = parseMailSpan($(element), receivedAt, userIds);
		if (mail) {
			parsedMails.push(mail);
		}
	});

	return parsedMails;
}

function buildPayeeMap(
	parsedMails: ParsedMail[],
	userId: string,
): Map<string, NewPayee> {
	const map = new Map<string, NewPayee>();

	for (const mail of parsedMails) {
		map.set(mail.payee_upi_id, {
			payee_upi_id: mail.payee_upi_id,
			name: mail.name,
			user_id: userId,
		});
	}

	return map;
}

// -----------------------------------------------------------------------------
// Env / config helpers
// -----------------------------------------------------------------------------

function getUserUpiIds(): string[] {
	return process.env.IDS?.split(",").map((id) => id.trim()) ?? [];
}

function getGmailSearchAfterSeconds(latestDate: Date): number {
	return Math.floor(new Date(latestDate).getTime() / 1000);
}

// -----------------------------------------------------------------------------
// Gmail API IO helpers
// -----------------------------------------------------------------------------

async function getGoogleAccount(userId: string) {
	const rows = await db
		.select({
			refreshToken: account.refreshToken,
			accountId: account.accountId,
		})
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, "google")))
		.limit(1);

	return rows[0] ?? null;
}

async function getAccessToken(refreshToken: string): Promise<string> {
	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: process.env.GOOGLE_CLIENT_ID!,
			client_secret: process.env.GOOGLE_CLIENT_SECRET!,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Failed to refresh Gmail access token: ${err}`);
	}

	const data = (await res.json()) as { access_token: string };
	return data.access_token;
}

function buildGmailSearchQuery(afterSeconds: number): string {
	const fromEmail = process.env.CHECK_MAIL;
	return fromEmail
		? `from:${fromEmail} after:${afterSeconds}`
		: `after:${afterSeconds}`;
}

async function listMessages(accessToken: string, afterSeconds: number) {
	const query = buildGmailSearchQuery(afterSeconds);
	const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
	url.searchParams.set("q", query);
	url.searchParams.set("maxResults", "100");

	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Gmail listMessages failed: ${err}`);
	}

	const data = (await res.json()) as { messages?: { id: string }[] };
	return data.messages ?? [];
}

async function getMessage(accessToken: string, messageId: string) {
	const res = await fetch(
		`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
		{ headers: { Authorization: `Bearer ${accessToken}` } },
	);

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Gmail getMessage failed: ${err}`);
	}

	return res.json() as Promise<GmailMessage>;
}

async function fetchAllMessages(
	accessToken: string,
	afterSeconds: number,
): Promise<GmailMessage[]> {
	const messageMetas = await listMessages(accessToken, afterSeconds);
	return Promise.all(
		messageMetas.map((meta) => getMessage(accessToken, meta.id)),
	);
}

// -----------------------------------------------------------------------------
// Database IO helpers
// -----------------------------------------------------------------------------

async function getLatestExpenseDate(userId: string): Promise<Date | null> {
	const rows = await db
		.select({ latestDate: max(expense.transaction_date) })
		.from(expense)
		.where(eq(expense.user_id, userId));

	return rows[0]?.latestDate ?? null;
}

async function persistPayees(newPayees: NewPayee[]) {
	if (newPayees.length === 0) return;

	await db
		.insert(payee)
		.values(newPayees)
		.onConflictDoUpdate({
			target: payee.payee_upi_id,
			set: { name: sql`excluded.name` },
		});
}

async function fetchPayeeIdMap(userId: string): Promise<Map<string, number>> {
	const dbPayees = await db
		.select({ payee_upi_id: payee.payee_upi_id, id: payee.id })
		.from(payee)
		.where(eq(payee.user_id, userId));

	return new Map(dbPayees.map((p) => [p.payee_upi_id, p.id]));
}

function buildExpensesToInsert(
	parsedMails: ParsedMail[],
	payeeIdMap: Map<string, number>,
	userId: string,
) {
	return parsedMails.map((mail) => ({
		upi_ref_no: mail.upi_ref_no,
		sender_upi_id: mail.sender_upi_id,
		amount: mail.amount,
		transaction_date: mail.transaction_date,
		payee_id: payeeIdMap.get(mail.payee_upi_id) ?? 0,
		user_id: userId,
	}));
}

async function persistExpenses(
	parsedMails: ParsedMail[],
	payeeIdMap: Map<string, number>,
	userId: string,
) {
	const expensesToInsert = buildExpensesToInsert(parsedMails, payeeIdMap, userId);

	if (expensesToInsert.length === 0) return [];

	return db
		.insert(expense)
		.values(expensesToInsert)
		.onConflictDoNothing({ target: expense.upi_ref_no })
		.returning({ upi_ref_no: expense.upi_ref_no });
}

// -----------------------------------------------------------------------------
// Result helpers
// -----------------------------------------------------------------------------

function buildLoadResult(insertedRowCount: number): LoadResult {
	if (insertedRowCount === 0) {
		return { message: "Data up-to date" };
	}

	return { message: "Expenses loaded successfully" };
}

// -----------------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------------

export const loadExpensesGmailApi = createServerFn({ method: "POST" }).handler(
	async () => {
		const user = await getUser();
		if (!user) {
			throw new Error("Invalid User");
		}

		const googleAccount = await getGoogleAccount(user.id);
		if (!googleAccount?.refreshToken) {
			return {
				message:
					"Google account not linked. Please sign in with Google to load expenses.",
			};
		}

		const latestDate = await getLatestExpenseDate(user.id);
		if (!latestDate) {
			return { message: "No expenses added yet. Please do a full load" };
		}

		const accessToken = await getAccessToken(googleAccount.refreshToken);
		const afterSeconds = getGmailSearchAfterSeconds(latestDate);
		const messages = await fetchAllMessages(accessToken, afterSeconds);

		if (messages.length === 0) {
			return { message: "No new mails found" };
		}

		const userIds = getUserUpiIds();
		const parsedMails = messages.flatMap((message) =>
			parseMessage(message, userIds),
		);

		const payeeMap = buildPayeeMap(parsedMails, user.id);
		await persistPayees(Array.from(payeeMap.values()));

		const payeeIdMap = await fetchPayeeIdMap(user.id);
		const insertedRows = await persistExpenses(parsedMails, payeeIdMap, user.id);

		return buildLoadResult(insertedRows.length);
	},
);
