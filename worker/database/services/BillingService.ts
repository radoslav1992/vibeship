/**
 * Billing Service — абонаменти и кредити.
 *
 * Кредитите живеят в три кофи, които се харчат в този ред:
 *   1. месечна дажба на плана (нулира се в началото на всеки период),
 *   2. пренесени от предходни месеци (изтичат след `rolloverMonths`),
 *   3. купени с пакет (не изтичат).
 *
 * Така потребителят винаги първо изразходва това, което така или иначе
 * ще изгори, а купените кредити му остават.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { BaseService } from './BaseService';
import {
	billingEvents,
	creditBalances,
	creditLedger,
	subscriptions,
	apps,
	type CreditBalance,
	type Subscription,
} from '../schema';
import {
	CREDIT_COSTS,
	DEFAULT_PLAN,
	PLANS,
	type BillingSummary,
	type CreditAction,
	type CreditBalanceSummary,
	type DailyUsagePoint,
	type LedgerEntry,
	type LedgerKind,
	type PlanId,
	type SubscriptionStatus,
	type UsageBreakdown,
} from '../../../shared/types/billing';

/** Грешка при недостиг на кредити — контролерите я връщат като 402. */
export class InsufficientCreditsError extends Error {
	readonly required: number;
	readonly available: number;

	constructor(required: number, available: number) {
		super(`Недостатъчно кредити: нужни ${required}, налични ${available}`);
		this.name = 'InsufficientCreditsError';
		this.required = required;
		this.available = available;
	}
}

/** Как един разход се разпределя между трите кофи. */
export interface SpendAllocation {
	fromMonthly: number;
	fromRollover: number;
	fromTopup: number;
	/** Непокрит остатък — при достатъчно салдо винаги е 0. */
	shortfall: number;
}

/**
 * Разпределя разход по кофите в реда „месечна дажба → пренос → купени“.
 *
 * Изнесено като чиста функция, защото това е правилото, което определя кои
 * кредити изгарят първи, и заслужава да се тества без база.
 */
export function allocateSpend(
	balance: Pick<
		CreditBalance,
		'monthlyAllowance' | 'monthlyUsed' | 'rolloverCredits' | 'topupCredits'
	>,
	cost: number,
): SpendAllocation {
	let remaining = Math.max(0, cost);

	const monthlyRemaining = Math.max(0, balance.monthlyAllowance - balance.monthlyUsed);
	const fromMonthly = Math.min(monthlyRemaining, remaining);
	remaining -= fromMonthly;

	const fromRollover = Math.min(Math.max(0, balance.rolloverCredits), remaining);
	remaining -= fromRollover;

	const fromTopup = Math.min(Math.max(0, balance.topupCredits), remaining);
	remaining -= fromTopup;

	return { fromMonthly, fromRollover, fromTopup, shortfall: remaining };
}

/** Резултат от начисляване/изразходване. */
export interface ChargeResult {
	charged: number;
	balance: CreditBalanceSummary;
	ledgerId: string;
}

function startOfMonth(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()),
	);
}

function toIso(value: Date | number | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	return new Date(value).toISOString();
}

export class BillingService extends BaseService {
	// ── Абонамент ────────────────────────────────────────────────────

	/**
	 * Връща абонамента на потребителя, като го създава като „free“, ако
	 * още няма ред. Всеки потребител има абонамент — просто безплатният е
	 * подразбиращият се.
	 */
	async getOrCreateSubscription(userId: string): Promise<Subscription> {
		const existing = await this.database
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.userId, userId))
			.get();

		if (existing) return existing;

		const now = new Date();
		const record = {
			id: crypto.randomUUID(),
			userId,
			planId: DEFAULT_PLAN,
			status: 'active' as SubscriptionStatus,
			currentPeriodStart: startOfMonth(now),
			currentPeriodEnd: addMonths(startOfMonth(now), 1),
			seats: PLANS[DEFAULT_PLAN].seats,
			createdAt: now,
			updatedAt: now,
		};

		await this.database.insert(subscriptions).values(record).onConflictDoNothing().run();

		const created = await this.database
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.userId, userId))
			.get();

		// `onConflictDoNothing` покрива състезание между два паралелни заявки;
		// в този случай четем реда, който е спечелил.
		return created ?? (record as unknown as Subscription);
	}

	async getPlanId(userId: string): Promise<PlanId> {
		const subscription = await this.getOrCreateSubscription(userId);
		// Прекратен или неплатен абонамент пада обратно на безплатния план,
		// вместо да дава достъп до платените лимити.
		if (subscription.status === 'canceled' || subscription.status === 'incomplete') {
			return DEFAULT_PLAN;
		}
		return subscription.planId as PlanId;
	}

	/**
	 * Записва промяна на плана (обикновено след Stripe събитие).
	 * Начислява дажбата на новия план веднага, за да не чака потребителят
	 * следващия период след като е платил.
	 */
	async setPlan(
		userId: string,
		planId: PlanId,
		options: {
			status?: SubscriptionStatus;
			stripeCustomerId?: string | null;
			stripeSubscriptionId?: string | null;
			stripePriceId?: string | null;
			currentPeriodStart?: Date | null;
			currentPeriodEnd?: Date | null;
			cancelAtPeriodEnd?: boolean;
			seats?: number;
			stripeEventId?: string;
		} = {},
	): Promise<void> {
		const subscription = await this.getOrCreateSubscription(userId);
		const previousPlan = subscription.planId as PlanId;
		const now = new Date();

		await this.database
			.update(subscriptions)
			.set({
				planId,
				status: options.status ?? 'active',
				stripeCustomerId: options.stripeCustomerId ?? subscription.stripeCustomerId,
				stripeSubscriptionId:
					options.stripeSubscriptionId ?? subscription.stripeSubscriptionId,
				stripePriceId: options.stripePriceId ?? subscription.stripePriceId,
				currentPeriodStart: options.currentPeriodStart ?? subscription.currentPeriodStart,
				currentPeriodEnd: options.currentPeriodEnd ?? subscription.currentPeriodEnd,
				cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? subscription.cancelAtPeriodEnd,
				seats: options.seats ?? PLANS[planId].seats,
				updatedAt: now,
			})
			.where(eq(subscriptions.userId, userId))
			.run();

		if (planId !== previousPlan) {
			await this.applyPlanChangeToBalance(userId, planId, options.stripeEventId);
		}
	}

	/** Запазва Stripe customer ID-то, за да не се създава нов клиент всеки път. */
	async setStripeCustomerId(userId: string, customerId: string): Promise<void> {
		await this.getOrCreateSubscription(userId);
		await this.database
			.update(subscriptions)
			.set({ stripeCustomerId: customerId, updatedAt: new Date() })
			.where(eq(subscriptions.userId, userId))
			.run();
	}

	async findUserIdByStripeCustomer(customerId: string): Promise<string | null> {
		const row = await this.database
			.select({ userId: subscriptions.userId })
			.from(subscriptions)
			.where(eq(subscriptions.stripeCustomerId, customerId))
			.get();
		return row?.userId ?? null;
	}

	// ── Салдо ────────────────────────────────────────────────────────

	/**
	 * Връща салдото за текущия период, като преди това го превърта, ако
	 * периодът е изтекъл. Това е единствената точка, през която се чете
	 * салдо — така превъртането не може да бъде пропуснато.
	 */
	async getBalance(userId: string): Promise<CreditBalance> {
		const planId = await this.getPlanId(userId);
		const plan = PLANS[planId];
		const now = new Date();

		let balance = await this.database
			.select()
			.from(creditBalances)
			.where(eq(creditBalances.userId, userId))
			.get();

		if (!balance) {
			const periodStart = startOfMonth(now);
			const periodEnd = addMonths(periodStart, 1);
			const record = {
				userId,
				monthlyAllowance: plan.monthlyCredits,
				monthlyUsed: 0,
				rolloverCredits: 0,
				rolloverExpiresAt: null,
				topupCredits: 0,
				periodStart,
				periodEnd,
				createdAt: now,
				updatedAt: now,
			};
			await this.database.insert(creditBalances).values(record).onConflictDoNothing().run();
			await this.writeLedger({
				userId,
				kind: 'grant',
				amount: plan.monthlyCredits,
				balanceAfter: plan.monthlyCredits,
				description: `Начални кредити по план ${planId}`,
			});
			balance = await this.database
				.select()
				.from(creditBalances)
				.where(eq(creditBalances.userId, userId))
				.get();
			if (balance) return balance;
			return record as unknown as CreditBalance;
		}

		if (new Date(balance.periodEnd).getTime() <= now.getTime()) {
			return this.rollPeriod(userId, balance, planId);
		}

		// Изтекъл пренос — изчистваме го, преди да го покажем като наличен.
		if (
			balance.rolloverCredits > 0 &&
			balance.rolloverExpiresAt &&
			new Date(balance.rolloverExpiresAt).getTime() <= now.getTime()
		) {
			const expired = balance.rolloverCredits;
			await this.database
				.update(creditBalances)
				.set({ rolloverCredits: 0, rolloverExpiresAt: null, updatedAt: now })
				.where(eq(creditBalances.userId, userId))
				.run();
			const remaining =
				balance.monthlyAllowance - balance.monthlyUsed + balance.topupCredits;
			await this.writeLedger({
				userId,
				kind: 'expire',
				amount: -expired,
				balanceAfter: Math.max(0, remaining),
				description: 'Изтекли пренесени кредити',
			});
			balance = { ...balance, rolloverCredits: 0, rolloverExpiresAt: null };
		}

		// Планът може да е сменен извън billing потока (служебно) — държим
		// дажбата в синхрон с текущия план.
		if (balance.monthlyAllowance !== plan.monthlyCredits) {
			await this.database
				.update(creditBalances)
				.set({ monthlyAllowance: plan.monthlyCredits, updatedAt: now })
				.where(eq(creditBalances.userId, userId))
				.run();
			balance = { ...balance, monthlyAllowance: plan.monthlyCredits };
		}

		return balance;
	}

	/**
	 * Превърта периода: неизползваните месечни кредити стават пренос (ако
	 * планът го позволява), а дажбата се начислява наново.
	 */
	private async rollPeriod(
		userId: string,
		balance: CreditBalance,
		planId: PlanId,
	): Promise<CreditBalance> {
		const plan = PLANS[planId];
		const now = new Date();
		const unused = Math.max(0, balance.monthlyAllowance - balance.monthlyUsed);

		const rolloverEnabled = plan.rolloverMonths > 0;
		const rolloverExpired =
			balance.rolloverExpiresAt !== null &&
			new Date(balance.rolloverExpiresAt).getTime() <= now.getTime();
		const keptRollover = rolloverExpired ? 0 : balance.rolloverCredits;

		const newRollover = rolloverEnabled ? keptRollover + unused : 0;
		// Преносът е валиден `rolloverMonths` месеца напред от новия период.
		const periodStart = startOfMonth(now);
		const periodEnd = addMonths(periodStart, 1);
		const rolloverExpiresAt = rolloverEnabled
			? addMonths(periodStart, plan.rolloverMonths)
			: null;

		await this.database
			.update(creditBalances)
			.set({
				monthlyAllowance: plan.monthlyCredits,
				monthlyUsed: 0,
				rolloverCredits: newRollover,
				rolloverExpiresAt,
				periodStart,
				periodEnd,
				updatedAt: now,
			})
			.where(eq(creditBalances.userId, userId))
			.run();

		const total = plan.monthlyCredits + newRollover + balance.topupCredits;

		if (rolloverEnabled && unused > 0) {
			await this.writeLedger({
				userId,
				kind: 'rollover',
				amount: unused,
				balanceAfter: total,
				description: 'Пренос от предходния месец',
			});
		}
		await this.writeLedger({
			userId,
			kind: 'grant',
			amount: plan.monthlyCredits,
			balanceAfter: total,
			description: `Месечни кредити по план ${planId}`,
		});

		return {
			...balance,
			monthlyAllowance: plan.monthlyCredits,
			monthlyUsed: 0,
			rolloverCredits: newRollover,
			rolloverExpiresAt,
			periodStart,
			periodEnd,
		};
	}

	/**
	 * При смяна на план: новата дажба важи веднага. Похарченото до момента
	 * се запазва, за да не може смяна напред-назад да произведе кредити.
	 */
	private async applyPlanChangeToBalance(
		userId: string,
		planId: PlanId,
		stripeEventId?: string,
	): Promise<void> {
		const plan = PLANS[planId];
		const balance = await this.getBalance(userId);
		const now = new Date();

		const previousAllowance = balance.monthlyAllowance;
		if (plan.monthlyCredits === previousAllowance) return;

		await this.database
			.update(creditBalances)
			.set({ monthlyAllowance: plan.monthlyCredits, updatedAt: now })
			.where(eq(creditBalances.userId, userId))
			.run();

		const delta = plan.monthlyCredits - previousAllowance;
		const total =
			Math.max(0, plan.monthlyCredits - balance.monthlyUsed) +
			balance.rolloverCredits +
			balance.topupCredits;

		await this.writeLedger({
			userId,
			kind: delta > 0 ? 'grant' : 'expire',
			amount: delta,
			balanceAfter: total,
			description: `Смяна на план: ${planId}`,
			stripeEventId,
		});
	}

	// ── Харчене и начисляване ────────────────────────────────────────

	/** Колко кредита са налични общо. */
	availableFrom(balance: CreditBalance): number {
		return (
			Math.max(0, balance.monthlyAllowance - balance.monthlyUsed) +
			balance.rolloverCredits +
			balance.topupCredits
		);
	}

	/** Проверява дали има достатъчно кредити, без да харчи. */
	async canAfford(userId: string, action: CreditAction): Promise<boolean> {
		const balance = await this.getBalance(userId);
		return this.availableFrom(balance) >= CREDIT_COSTS[action];
	}

	/**
	 * Изразходва кредити за действие. Хвърля `InsufficientCreditsError`,
	 * ако салдото не стига — извикващият решава дали да го покаже като 402.
	 */
	async charge(
		userId: string,
		action: CreditAction,
		options: { appId?: string | null; description?: string; amount?: number } = {},
	): Promise<ChargeResult> {
		const cost = options.amount ?? CREDIT_COSTS[action];
		const balance = await this.getBalance(userId);
		const available = this.availableFrom(balance);

		if (available < cost) {
			throw new InsufficientCreditsError(cost, available);
		}

		const { fromMonthly, fromRollover, fromTopup } = allocateSpend(balance, cost);

		const now = new Date();
		await this.database
			.update(creditBalances)
			.set({
				monthlyUsed: balance.monthlyUsed + fromMonthly,
				rolloverCredits: balance.rolloverCredits - fromRollover,
				topupCredits: balance.topupCredits - fromTopup,
				updatedAt: now,
			})
			.where(eq(creditBalances.userId, userId))
			.run();

		const balanceAfter = available - cost;
		const ledgerId = await this.writeLedger({
			userId,
			appId: options.appId ?? null,
			kind: 'spend',
			action,
			amount: -cost,
			balanceAfter,
			description: options.description ?? null,
		});

		return {
			charged: cost,
			ledgerId,
			balance: this.toBalanceSummary({
				...balance,
				monthlyUsed: balance.monthlyUsed + fromMonthly,
				rolloverCredits: balance.rolloverCredits - fromRollover,
				topupCredits: balance.topupCredits - fromTopup,
			}),
		};
	}

	/**
	 * Връща кредити (например когато генерирането се е провалило и не е
	 * редно потребителят да плати за него).
	 */
	async refund(
		userId: string,
		amount: number,
		options: { appId?: string | null; description?: string } = {},
	): Promise<void> {
		if (amount <= 0) return;
		const balance = await this.getBalance(userId);
		const now = new Date();

		// Връщаме първо в месечната кофа, доколкото има изхарчено там.
		const toMonthly = Math.min(balance.monthlyUsed, amount);
		const toTopup = amount - toMonthly;

		await this.database
			.update(creditBalances)
			.set({
				monthlyUsed: balance.monthlyUsed - toMonthly,
				topupCredits: balance.topupCredits + toTopup,
				updatedAt: now,
			})
			.where(eq(creditBalances.userId, userId))
			.run();

		await this.writeLedger({
			userId,
			appId: options.appId ?? null,
			kind: 'refund',
			amount,
			balanceAfter: this.availableFrom(balance) + amount,
			description: options.description ?? 'Върнати кредити',
		});
	}

	/** Начислява купен пакет кредити. */
	async addTopup(
		userId: string,
		credits: number,
		options: { description?: string; stripeEventId?: string } = {},
	): Promise<void> {
		const balance = await this.getBalance(userId);
		const now = new Date();

		await this.database
			.update(creditBalances)
			.set({ topupCredits: balance.topupCredits + credits, updatedAt: now })
			.where(eq(creditBalances.userId, userId))
			.run();

		await this.writeLedger({
			userId,
			kind: 'topup',
			amount: credits,
			balanceAfter: this.availableFrom(balance) + credits,
			description: options.description ?? `Закупен пакет от ${credits} кредита`,
			stripeEventId: options.stripeEventId,
		});
	}

	private async writeLedger(entry: {
		userId: string;
		appId?: string | null;
		kind: LedgerKind;
		action?: CreditAction | null;
		amount: number;
		balanceAfter: number;
		description?: string | null;
		stripeEventId?: string;
	}): Promise<string> {
		const id = crypto.randomUUID();
		await this.database
			.insert(creditLedger)
			.values({
				id,
				userId: entry.userId,
				appId: entry.appId ?? null,
				kind: entry.kind,
				action: entry.action ?? null,
				amount: entry.amount,
				balanceAfter: entry.balanceAfter,
				description: entry.description ?? null,
				stripeEventId: entry.stripeEventId ?? null,
				createdAt: new Date(),
			})
			.run();
		return id;
	}

	// ── Идемпотентност на Stripe събитията ───────────────────────────

	/**
	 * Отбелязва Stripe събитие като обработено. Връща `false`, ако вече е
	 * било обработено — тогава извикващият трябва да не прави нищо.
	 */
	async markEventProcessed(
		eventId: string,
		type: string,
		userId: string | null,
		payload?: unknown,
	): Promise<boolean> {
		const existing = await this.database
			.select({ id: billingEvents.id })
			.from(billingEvents)
			.where(eq(billingEvents.id, eventId))
			.get();
		if (existing) return false;

		await this.database
			.insert(billingEvents)
			.values({
				id: eventId,
				type,
				userId,
				payload: payload ? JSON.stringify(payload).slice(0, 8000) : null,
				processedAt: new Date(),
			})
			.onConflictDoNothing()
			.run();
		return true;
	}

	// ── Обобщения за UI-я ────────────────────────────────────────────

	toBalanceSummary(balance: CreditBalance): CreditBalanceSummary {
		const monthlyRemaining = Math.max(0, balance.monthlyAllowance - balance.monthlyUsed);
		return {
			monthlyRemaining,
			monthlyAllowance: balance.monthlyAllowance,
			monthlyUsed: balance.monthlyUsed,
			rolloverCredits: balance.rolloverCredits,
			topupCredits: balance.topupCredits,
			totalAvailable: monthlyRemaining + balance.rolloverCredits + balance.topupCredits,
			periodStart: toIso(balance.periodStart) ?? new Date().toISOString(),
			periodEnd: toIso(balance.periodEnd) ?? new Date().toISOString(),
		};
	}

	/** Пълното резюме, което захранва екрана „Кредити“. */
	async getSummary(userId: string, stripeEnabled: boolean): Promise<BillingSummary> {
		const [subscription, balance] = await Promise.all([
			this.getOrCreateSubscription(userId),
			this.getBalance(userId),
		]);

		const periodStart = new Date(balance.periodStart);
		const [usage, dailyUsage, ledger] = await Promise.all([
			this.getUsageBreakdown(userId, periodStart),
			this.getDailyUsage(userId, periodStart),
			this.getLedger(userId, 25),
		]);

		return {
			subscription: {
				planId: subscription.planId as PlanId,
				status: subscription.status as SubscriptionStatus,
				cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
				currentPeriodEnd:
					toIso(subscription.currentPeriodEnd) ?? toIso(balance.periodEnd),
				seats: subscription.seats,
				managedByStripe: Boolean(subscription.stripeSubscriptionId),
			},
			balance: this.toBalanceSummary(balance),
			usage,
			dailyUsage,
			ledger,
			stripeEnabled,
		};
	}

	/** Разбивка на изхарченото за периода: генериране срещу публикуване. */
	async getUsageBreakdown(userId: string, since: Date): Promise<UsageBreakdown> {
		const rows = await this.getReadDb()
			.select({
				action: creditLedger.action,
				total: sql<number>`sum(-${creditLedger.amount})`,
			})
			.from(creditLedger)
			.where(
				and(
					eq(creditLedger.userId, userId),
					eq(creditLedger.kind, 'spend'),
					gte(creditLedger.createdAt, since),
				),
			)
			.groupBy(creditLedger.action)
			.all();

		let generation = 0;
		let deploy = 0;
		for (const row of rows) {
			const total = Number(row.total ?? 0);
			if (row.action === 'deploy') deploy += total;
			else generation += total;
		}
		return { generation, deploy };
	}

	/** Дневна употреба за стълбовидната диаграма. */
	async getDailyUsage(userId: string, since: Date): Promise<DailyUsagePoint[]> {
		const rows = await this.getReadDb()
			.select({
				day: sql<string>`date(${creditLedger.createdAt}, 'unixepoch')`,
				action: creditLedger.action,
				total: sql<number>`sum(-${creditLedger.amount})`,
			})
			.from(creditLedger)
			.where(
				and(
					eq(creditLedger.userId, userId),
					eq(creditLedger.kind, 'spend'),
					gte(creditLedger.createdAt, since),
				),
			)
			.groupBy(sql`date(${creditLedger.createdAt}, 'unixepoch')`, creditLedger.action)
			.all();

		const byDay = new Map<string, DailyUsagePoint>();
		for (const row of rows) {
			const day = row.day;
			const point = byDay.get(day) ?? { date: day, generation: 0, deploy: 0 };
			const total = Number(row.total ?? 0);
			if (row.action === 'deploy') point.deploy += total;
			else point.generation += total;
			byDay.set(day, point);
		}

		return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
	}

	/** Последните движения по кредитите, с името на проекта. */
	async getLedger(userId: string, limit = 25): Promise<LedgerEntry[]> {
		const rows = await this.getReadDb()
			.select({
				id: creditLedger.id,
				kind: creditLedger.kind,
				action: creditLedger.action,
				amount: creditLedger.amount,
				description: creditLedger.description,
				appId: creditLedger.appId,
				appTitle: apps.title,
				createdAt: creditLedger.createdAt,
			})
			.from(creditLedger)
			.leftJoin(apps, eq(creditLedger.appId, apps.id))
			.where(eq(creditLedger.userId, userId))
			.orderBy(desc(creditLedger.createdAt))
			.limit(limit)
			.all();

		return rows.map((row) => ({
			id: row.id,
			kind: row.kind as LedgerKind,
			action: (row.action as CreditAction | null) ?? null,
			amount: row.amount,
			description: row.description,
			appId: row.appId,
			appTitle: row.appTitle ?? null,
			createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
		}));
	}
}
