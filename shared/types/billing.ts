/**
 * Абонаменти и кредити на Vibeship.
 *
 * Този файл се ползва и от Worker-а, и от фронтенда, за да няма две
 * дефиниции на плановете, които да се разминат.
 */

export type PlanId = 'free' | 'starter' | 'pro' | 'team';

export type SubscriptionStatus =
	| 'active'
	| 'trialing'
	| 'past_due'
	| 'canceled'
	| 'incomplete';

/** Действията, които харчат кредити. */
export type CreditAction =
	| 'message'
	| 'deploy'
	| 'create'
	| 'generation'
	| 'index';

/** Видовете движения в дневника на кредитите. */
export type LedgerKind =
	| 'grant'
	| 'rollover'
	| 'topup'
	| 'spend'
	| 'refund'
	| 'expire';

export interface PlanDefinition {
	id: PlanId;
	/** Ключ в речника за името — UI-ят го превежда. */
	nameKey: string;
	whoKey: string;
	/** Цена в евроцентове на месец. */
	priceCents: number;
	currency: 'EUR';
	/** Кредити, начислявани в началото на всеки период. */
	monthlyCredits: number;
	/** Колко месеца се пренасят неизползвани кредити (0 = без пренос). */
	rolloverMonths: number;
	/** Максимум активни проекта; `null` означава без ограничение. */
	maxActiveProjects: number | null;
	/** Включени места (за екипните планове). */
	seats: number;
	/** Може ли да публикува в собствен Cloudflare акаунт. */
	ownCloudflareAccount: boolean;
	/** Може ли да ползва собствен домейн. */
	customDomain: boolean;
	/** Ключове за списъка с включени неща. */
	featureKeys: string[];
	/** Дали планът е маркиран като „най-избиран“. */
	highlighted: boolean;
	/**
	 * Ключ на променливата на средата, която пази Stripe Price ID-то.
	 * Безплатният план няма цена в Stripe.
	 */
	stripePriceEnvKey?: string;
}

/** Колко кредита струва всяко действие. */
export const CREDIT_COSTS: Record<CreditAction, number> = {
	/** Едно съобщение до агента. */
	message: 1,
	/** Едно публикуване (Cloudflare + GitHub push). */
	deploy: 2,
	/** Създаване на нов проект (първоначално генериране). */
	create: 4,
	/** Допълнително генериране извън обикновено съобщение. */
	generation: 3,
	/** Индексиране на документи за RAG. */
	index: 5,
};

export const PLANS: Record<PlanId, PlanDefinition> = {
	free: {
		id: 'free',
		nameKey: 'plan.free.name',
		whoKey: 'plan.free.who',
		priceCents: 0,
		currency: 'EUR',
		monthlyCredits: 5,
		rolloverMonths: 0,
		maxActiveProjects: 1,
		seats: 1,
		ownCloudflareAccount: false,
		customDomain: false,
		featureKeys: [
			'plan.free.feat1',
			'plan.free.feat2',
			'plan.free.feat3',
			'plan.free.feat4',
		],
		highlighted: false,
	},
	starter: {
		id: 'starter',
		nameKey: 'plan.starter.name',
		whoKey: 'plan.starter.who',
		priceCents: 1900,
		currency: 'EUR',
		monthlyCredits: 100,
		rolloverMonths: 2,
		maxActiveProjects: 3,
		seats: 1,
		ownCloudflareAccount: false,
		customDomain: true,
		featureKeys: [
			'plan.starter.feat1',
			'plan.starter.feat2',
			'plan.starter.feat3',
			'plan.starter.feat4',
			'plan.starter.feat5',
		],
		highlighted: false,
		stripePriceEnvKey: 'STRIPE_PRICE_STARTER',
	},
	pro: {
		id: 'pro',
		nameKey: 'plan.pro.name',
		whoKey: 'plan.pro.who',
		priceCents: 4900,
		currency: 'EUR',
		monthlyCredits: 250,
		rolloverMonths: 2,
		maxActiveProjects: null,
		seats: 1,
		ownCloudflareAccount: true,
		customDomain: true,
		featureKeys: [
			'plan.pro.feat1',
			'plan.pro.feat2',
			'plan.pro.feat3',
			'plan.pro.feat4',
			'plan.pro.feat5',
		],
		highlighted: true,
		stripePriceEnvKey: 'STRIPE_PRICE_PRO',
	},
	team: {
		id: 'team',
		nameKey: 'plan.team.name',
		whoKey: 'plan.team.who',
		priceCents: 12900,
		currency: 'EUR',
		monthlyCredits: 500,
		rolloverMonths: 2,
		maxActiveProjects: null,
		seats: 5,
		ownCloudflareAccount: true,
		customDomain: true,
		featureKeys: [
			'plan.team.feat1',
			'plan.team.feat2',
			'plan.team.feat3',
			'plan.team.feat4',
			'plan.team.feat5',
		],
		highlighted: false,
		stripePriceEnvKey: 'STRIPE_PRICE_TEAM',
	},
};

export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro', 'team'];

export const DEFAULT_PLAN: PlanId = 'free';

/** Пакетите с кредити за еднократна покупка. */
export interface CreditPack {
	id: string;
	credits: number;
	priceCents: number;
	currency: 'EUR';
	stripePriceEnvKey: string;
}

export const CREDIT_PACKS: CreditPack[] = [
	{
		id: 'pack-100',
		credits: 100,
		priceCents: 900,
		currency: 'EUR',
		stripePriceEnvKey: 'STRIPE_PRICE_PACK_100',
	},
	{
		id: 'pack-300',
		credits: 300,
		priceCents: 2400,
		currency: 'EUR',
		stripePriceEnvKey: 'STRIPE_PRICE_PACK_300',
	},
];

export function isPlanId(value: string): value is PlanId {
	return value in PLANS;
}

/** Форматира цена от центове („19 €“, „0 €“). */
export function formatPrice(cents: number, currency: 'EUR' = 'EUR'): string {
	const symbol = currency === 'EUR' ? '€' : currency;
	const whole = cents / 100;
	const text = Number.isInteger(whole) ? String(whole) : whole.toFixed(2);
	return `${text} ${symbol}`;
}

// ── Отговори на API-то ──────────────────────────────────────────────

export interface CreditBalanceSummary {
	/** Кредити от месечния план, които още не са похарчени. */
	monthlyRemaining: number;
	/** Месечна дажба по текущия план. */
	monthlyAllowance: number;
	/** Похарчено от месечната дажба през този период. */
	monthlyUsed: number;
	/** Пренесени от предходни месеци. */
	rolloverCredits: number;
	/** Купени с пакет (не изтичат). */
	topupCredits: number;
	/** Общо на разположение = monthlyRemaining + rollover + topup. */
	totalAvailable: number;
	/** Начало и край на текущия период (ISO). */
	periodStart: string;
	periodEnd: string;
}

export interface UsageBreakdown {
	/** Похарчени за генериране (message/create/generation/index). */
	generation: number;
	/** Похарчени за публикуване. */
	deploy: number;
}

export interface LedgerEntry {
	id: string;
	kind: LedgerKind;
	action: CreditAction | null;
	amount: number;
	description: string | null;
	appId: string | null;
	appTitle: string | null;
	createdAt: string;
}

export interface DailyUsagePoint {
	/** ISO дата — „2026-08-19“. */
	date: string;
	generation: number;
	deploy: number;
}

export interface SubscriptionSummary {
	planId: PlanId;
	status: SubscriptionStatus;
	cancelAtPeriodEnd: boolean;
	currentPeriodEnd: string | null;
	seats: number;
	/** Дали е свързан със Stripe (иначе е служебно зададен план). */
	managedByStripe: boolean;
}

export interface BillingSummary {
	subscription: SubscriptionSummary;
	balance: CreditBalanceSummary;
	usage: UsageBreakdown;
	dailyUsage: DailyUsagePoint[];
	ledger: LedgerEntry[];
	/** Дали Stripe е конфигуриран в тази инсталация. */
	stripeEnabled: boolean;
}
