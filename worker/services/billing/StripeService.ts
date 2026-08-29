/**
 * Stripe интеграция за Vibeship.
 *
 * Говорим директно с Stripe REST API през `fetch` — Workers средата няма
 * нужда от Node SDK-а, а така зависимостите остават малко. Подписите на
 * webhook-ите се проверяват с WebCrypto (HMAC-SHA256), както Stripe описва.
 */

import { createLogger } from '../../logger';
import {
	CREDIT_PACKS,
	PLANS,
	isPlanId,
	type CreditPack,
	type PlanId,
	type SubscriptionStatus,
} from '../../../shared/types/billing';

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2024-06-20';

/** Толеранс за времевата марка на webhook подписа (5 минути). */
const SIGNATURE_TOLERANCE_SECONDS = 300;

const logger = createLogger('StripeService');

export interface StripeEnv {
	STRIPE_SECRET_KEY?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	STRIPE_PRICE_STARTER?: string;
	STRIPE_PRICE_PRO?: string;
	STRIPE_PRICE_TEAM?: string;
	STRIPE_PRICE_PACK_100?: string;
	STRIPE_PRICE_PACK_300?: string;
}

export interface StripeEvent {
	id: string;
	type: string;
	data: { object: Record<string, unknown> };
}

export class StripeNotConfiguredError extends Error {
	constructor() {
		super('Stripe не е конфигуриран за тази инсталация');
		this.name = 'StripeNotConfiguredError';
	}
}

export class StripeService {
	private readonly env: Env & StripeEnv;

	constructor(env: Env) {
		this.env = env as Env & StripeEnv;
	}

	/** Дали инсталацията изобщо има Stripe ключове. */
	static isEnabled(env: Env): boolean {
		return Boolean((env as Env & StripeEnv).STRIPE_SECRET_KEY);
	}

	get enabled(): boolean {
		return Boolean(this.env.STRIPE_SECRET_KEY);
	}

	/** Price ID за план; `null`, ако планът е безплатен или не е настроен. */
	priceIdForPlan(planId: PlanId): string | null {
		const key = PLANS[planId].stripePriceEnvKey;
		if (!key) return null;
		const value = (this.env as unknown as Record<string, string | undefined>)[key];
		return value && value.length > 0 ? value : null;
	}

	/** Price ID за пакет кредити. */
	priceIdForPack(pack: CreditPack): string | null {
		const value = (this.env as unknown as Record<string, string | undefined>)[
			pack.stripePriceEnvKey
		];
		return value && value.length > 0 ? value : null;
	}

	/** Обратно търсене: от Stripe price ID към нашия план. */
	planIdForPrice(priceId: string): PlanId | null {
		for (const plan of Object.values(PLANS)) {
			if (!plan.stripePriceEnvKey) continue;
			const configured = (this.env as unknown as Record<string, string | undefined>)[
				plan.stripePriceEnvKey
			];
			if (configured && configured === priceId) return plan.id;
		}
		return null;
	}

	/** Обратно търсене: от Stripe price ID към пакет кредити. */
	packForPrice(priceId: string): CreditPack | null {
		for (const pack of CREDIT_PACKS) {
			const configured = (this.env as unknown as Record<string, string | undefined>)[
				pack.stripePriceEnvKey
			];
			if (configured && configured === priceId) return pack;
		}
		return null;
	}

	// ── Нисконивова обвивка около Stripe API ─────────────────────────

	private async request<T>(
		path: string,
		options: { method?: 'GET' | 'POST'; body?: Record<string, string> } = {},
	): Promise<T> {
		if (!this.env.STRIPE_SECRET_KEY) throw new StripeNotConfiguredError();

		const method = options.method ?? 'POST';
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}`,
			'Stripe-Version': STRIPE_API_VERSION,
		};
		let body: string | undefined;
		if (options.body) {
			headers['Content-Type'] = 'application/x-www-form-urlencoded';
			body = new URLSearchParams(options.body).toString();
		}

		const response = await fetch(`${STRIPE_API}${path}`, { method, headers, body });
		const text = await response.text();

		if (!response.ok) {
			logger.error('Stripe API грешка', { path, status: response.status, text });
			throw new Error(`Stripe API ${response.status}: ${text.slice(0, 400)}`);
		}

		return JSON.parse(text) as T;
	}

	// ── Клиенти ──────────────────────────────────────────────────────

	/** Създава Stripe клиент за потребителя. */
	async createCustomer(params: {
		userId: string;
		email: string;
		name?: string;
	}): Promise<string> {
		const customer = await this.request<{ id: string }>('/customers', {
			body: {
				email: params.email,
				...(params.name ? { name: params.name } : {}),
				'metadata[userId]': params.userId,
				// Stripe праща фактурите на български, където има превод.
				preferred_locales: 'bg',
			},
		});
		return customer.id;
	}

	// ── Плащания ─────────────────────────────────────────────────────

	/** Checkout сесия за абонамент. */
	async createSubscriptionCheckout(params: {
		customerId: string;
		priceId: string;
		userId: string;
		planId: PlanId;
		successUrl: string;
		cancelUrl: string;
		quantity?: number;
	}): Promise<{ id: string; url: string }> {
		return this.request<{ id: string; url: string }>('/checkout/sessions', {
			body: {
				mode: 'subscription',
				customer: params.customerId,
				'line_items[0][price]': params.priceId,
				'line_items[0][quantity]': String(params.quantity ?? 1),
				success_url: params.successUrl,
				cancel_url: params.cancelUrl,
				locale: 'bg',
				allow_promotion_codes: 'true',
				'metadata[userId]': params.userId,
				'metadata[planId]': params.planId,
				'subscription_data[metadata][userId]': params.userId,
				'subscription_data[metadata][planId]': params.planId,
			},
		});
	}

	/** Checkout сесия за еднократна покупка на пакет кредити. */
	async createPackCheckout(params: {
		customerId: string;
		priceId: string;
		userId: string;
		packId: string;
		credits: number;
		successUrl: string;
		cancelUrl: string;
	}): Promise<{ id: string; url: string }> {
		return this.request<{ id: string; url: string }>('/checkout/sessions', {
			body: {
				mode: 'payment',
				customer: params.customerId,
				'line_items[0][price]': params.priceId,
				'line_items[0][quantity]': '1',
				success_url: params.successUrl,
				cancel_url: params.cancelUrl,
				locale: 'bg',
				'metadata[userId]': params.userId,
				'metadata[packId]': params.packId,
				'metadata[credits]': String(params.credits),
				'payment_intent_data[metadata][userId]': params.userId,
				'payment_intent_data[metadata][packId]': params.packId,
			},
		});
	}

	/** Портал за самообслужване — смяна на карта, отказ, фактури. */
	async createPortalSession(params: {
		customerId: string;
		returnUrl: string;
	}): Promise<{ url: string }> {
		return this.request<{ url: string }>('/billing_portal/sessions', {
			body: {
				customer: params.customerId,
				return_url: params.returnUrl,
				locale: 'bg',
			},
		});
	}

	async getSubscription(subscriptionId: string): Promise<Record<string, unknown>> {
		return this.request<Record<string, unknown>>(`/subscriptions/${subscriptionId}`, {
			method: 'GET',
		});
	}

	// ── Проверка на webhook подпис ───────────────────────────────────

	/**
	 * Проверява `Stripe-Signature` и връща разпарсеното събитие.
	 * Хвърля при невалиден подпис или изтекла времева марка.
	 */
	async constructEvent(payload: string, signatureHeader: string): Promise<StripeEvent> {
		const secret = this.env.STRIPE_WEBHOOK_SECRET;
		if (!secret) throw new StripeNotConfiguredError();

		const parts = signatureHeader.split(',').reduce<Record<string, string[]>>(
			(acc, part) => {
				const [key, value] = part.split('=', 2);
				if (!key || !value) return acc;
				(acc[key.trim()] ??= []).push(value.trim());
				return acc;
			},
			{},
		);

		const timestamp = parts.t?.[0];
		const signatures = parts.v1 ?? [];
		if (!timestamp || signatures.length === 0) {
			throw new Error('Липсва валиден Stripe подпис');
		}

		const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
		if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
			throw new Error('Stripe подписът е с изтекла времева марка');
		}

		const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
		const matches = signatures.some((candidate) => timingSafeEqual(candidate, expected));
		if (!matches) {
			throw new Error('Невалиден Stripe подпис');
		}

		return JSON.parse(payload) as StripeEvent;
	}

	// ── Помощници за разчитане на Stripe обекти ──────────────────────

	/** Превежда Stripe статус към нашия. */
	static mapStatus(stripeStatus: string): SubscriptionStatus {
		switch (stripeStatus) {
			case 'active':
				return 'active';
			case 'trialing':
				return 'trialing';
			case 'past_due':
			case 'unpaid':
				return 'past_due';
			case 'canceled':
			case 'incomplete_expired':
				return 'canceled';
			default:
				return 'incomplete';
		}
	}

	/**
	 * Изважда плана от Stripe абонамент — първо по метаданните (най-надеждно,
	 * защото ние ги записваме), после по price ID.
	 */
	planFromSubscriptionObject(subscription: Record<string, unknown>): PlanId | null {
		const metadata = subscription.metadata as Record<string, string> | undefined;
		const fromMetadata = metadata?.planId;
		if (fromMetadata && isPlanId(fromMetadata)) return fromMetadata;

		const items = subscription.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
		const priceId = items?.data?.[0]?.price?.id;
		if (priceId) return this.planIdForPrice(priceId);

		return null;
	}
}

/** HMAC-SHA256 в hex, както Stripe очаква. */
async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/** Сравнение с постоянно време, за да не изтича информация по таймингa. */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}
