/**
 * Billing Controller — планове, кредити и плащания през Stripe.
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import {
	BillingService,
	InsufficientCreditsError,
} from '../../../database/services/BillingService';
import {
	StripeNotConfiguredError,
	StripeService,
} from '../../../services/billing/StripeService';
import {
	CREDIT_PACKS,
	PLANS,
	PLAN_ORDER,
	isPlanId,
	type BillingSummary,
	type PlanId,
} from '../../../../shared/types/billing';

interface CheckoutRequest {
	planId?: string;
	packId?: string;
}

interface CheckoutResponse {
	url: string;
}

/** Базовият адрес на приложението за success/cancel връзките. */
function appOrigin(request: Request, env: Env): string {
	const custom = env.CUSTOM_DOMAIN;
	if (custom && custom.length > 0 && !custom.startsWith('localhost')) {
		return `https://${custom}`;
	}
	return new URL(request.url).origin;
}

export class BillingController extends BaseController {
	static logger = createLogger('BillingController');

	/**
	 * GET /api/billing/summary
	 * Плана, салдото, употребата и дневника — всичко за екрана „Кредити“.
	 */
	static async getSummary(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return BillingController.createErrorResponse('Изисква се вход', 401);
		}

		try {
			const billing = new BillingService(env);
			const summary = await billing.getSummary(user.id, StripeService.isEnabled(env));
			return BillingController.createSuccessResponse<BillingSummary>(summary);
		} catch (error) {
			BillingController.logger.error('Неуспешно четене на резюмето', { error });
			return BillingController.handleError(error, 'get billing summary');
		}
	}

	/**
	 * GET /api/billing/plans
	 * Публичен списък с плановете и пакетите — захранва екрана „Планове“.
	 */
	static async getPlans(_request: Request, env: Env): Promise<Response> {
		const stripe = new StripeService(env);
		const plans = PLAN_ORDER.map((id) => ({
			...PLANS[id],
			/** Дали планът може да бъде закупен в тази инсталация. */
			purchasable: id === 'free' ? true : Boolean(stripe.priceIdForPlan(id)),
		}));
		const packs = CREDIT_PACKS.map((pack) => ({
			...pack,
			purchasable: Boolean(stripe.priceIdForPack(pack)),
		}));
		return BillingController.createSuccessResponse({
			plans,
			packs,
			stripeEnabled: StripeService.isEnabled(env),
		});
	}

	/**
	 * POST /api/billing/checkout
	 * Отваря Stripe Checkout за абонамент.
	 */
	static async createCheckout(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return BillingController.createErrorResponse('Изисква се вход', 401);
		}

		const parsed = await BillingController.parseJsonBody<CheckoutRequest>(request);
		if (!parsed.success || !parsed.data) {
			return parsed.response ?? BillingController.createErrorResponse('Невалидна заявка', 400);
		}

		const planId = parsed.data.planId;
		if (!planId || !isPlanId(planId)) {
			return BillingController.createErrorResponse('Непознат план', 400);
		}
		if (planId === 'free') {
			return BillingController.createErrorResponse(
				'Безплатният план не се купува',
				400,
			);
		}

		try {
			const stripe = new StripeService(env);
			const priceId = stripe.priceIdForPlan(planId);
			if (!priceId) {
				return BillingController.createErrorResponse(
					'Планът не е конфигуриран за плащане в тази инсталация',
					503,
				);
			}

			const billing = new BillingService(env);
			const customerId = await BillingController.ensureCustomer(billing, stripe, user);
			const origin = appOrigin(request, env);

			const session = await stripe.createSubscriptionCheckout({
				customerId,
				priceId,
				userId: user.id,
				planId: planId as PlanId,
				quantity: PLANS[planId as PlanId].seats > 1 ? 1 : 1,
				successUrl: `${origin}/credits?checkout=success`,
				cancelUrl: `${origin}/pricing?checkout=cancelled`,
			});

			return BillingController.createSuccessResponse<CheckoutResponse>({ url: session.url });
		} catch (error) {
			if (error instanceof StripeNotConfiguredError) {
				return BillingController.createErrorResponse(
					'Плащанията не са включени в тази инсталация',
					503,
				);
			}
			BillingController.logger.error('Неуспешен checkout', { error });
			return BillingController.handleError(error, 'create checkout session');
		}
	}

	/**
	 * POST /api/billing/topup
	 * Еднократна покупка на пакет кредити.
	 */
	static async createTopup(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return BillingController.createErrorResponse('Изисква се вход', 401);
		}

		const parsed = await BillingController.parseJsonBody<CheckoutRequest>(request);
		if (!parsed.success || !parsed.data) {
			return parsed.response ?? BillingController.createErrorResponse('Невалидна заявка', 400);
		}

		const pack = CREDIT_PACKS.find((candidate) => candidate.id === parsed.data?.packId);
		if (!pack) {
			return BillingController.createErrorResponse('Непознат пакет', 400);
		}

		try {
			const stripe = new StripeService(env);
			const priceId = stripe.priceIdForPack(pack);
			if (!priceId) {
				return BillingController.createErrorResponse(
					'Пакетът не е конфигуриран за плащане в тази инсталация',
					503,
				);
			}

			const billing = new BillingService(env);
			const customerId = await BillingController.ensureCustomer(billing, stripe, user);
			const origin = appOrigin(request, env);

			const session = await stripe.createPackCheckout({
				customerId,
				priceId,
				userId: user.id,
				packId: pack.id,
				credits: pack.credits,
				successUrl: `${origin}/credits?topup=success`,
				cancelUrl: `${origin}/credits?topup=cancelled`,
			});

			return BillingController.createSuccessResponse<CheckoutResponse>({ url: session.url });
		} catch (error) {
			if (error instanceof StripeNotConfiguredError) {
				return BillingController.createErrorResponse(
					'Плащанията не са включени в тази инсталация',
					503,
				);
			}
			BillingController.logger.error('Неуспешна покупка на пакет', { error });
			return BillingController.handleError(error, 'create topup session');
		}
	}

	/**
	 * POST /api/billing/portal
	 * Препраща към Stripe портала за управление на абонамента.
	 */
	static async createPortal(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return BillingController.createErrorResponse('Изисква се вход', 401);
		}

		try {
			const stripe = new StripeService(env);
			const billing = new BillingService(env);
			const subscription = await billing.getOrCreateSubscription(user.id);
			if (!subscription.stripeCustomerId) {
				return BillingController.createErrorResponse(
					'Още нямаш плащания за управление',
					400,
				);
			}

			const origin = appOrigin(request, env);
			const session = await stripe.createPortalSession({
				customerId: subscription.stripeCustomerId,
				returnUrl: `${origin}/credits`,
			});
			return BillingController.createSuccessResponse<CheckoutResponse>({ url: session.url });
		} catch (error) {
			if (error instanceof StripeNotConfiguredError) {
				return BillingController.createErrorResponse(
					'Плащанията не са включени в тази инсталация',
					503,
				);
			}
			return BillingController.handleError(error, 'create portal session');
		}
	}

	/**
	 * POST /api/billing/webhook
	 * Приема събитията от Stripe. Публичен маршрут — защитата е подписът.
	 */
	static async handleWebhook(request: Request, env: Env): Promise<Response> {
		const signature = request.headers.get('stripe-signature');
		if (!signature) {
			return new Response('Липсва подпис', { status: 400 });
		}

		const payload = await request.text();
		const stripe = new StripeService(env);
		const billing = new BillingService(env);

		let event;
		try {
			event = await stripe.constructEvent(payload, signature);
		} catch (error) {
			BillingController.logger.warn('Отхвърлен Stripe webhook', { error });
			return new Response('Невалиден подпис', { status: 400 });
		}

		try {
			const object = event.data.object as Record<string, unknown>;
			const metadata = (object.metadata ?? {}) as Record<string, string>;
			const customerId =
				typeof object.customer === 'string' ? object.customer : undefined;

			const userId =
				metadata.userId ??
				(customerId ? await billing.findUserIdByStripeCustomer(customerId) : null);

			const fresh = await billing.markEventProcessed(
				event.id,
				event.type,
				userId ?? null,
			);
			if (!fresh) {
				// Stripe повтаря събития — второто минаване не бива да начислява пак.
				return new Response('OK (вече обработено)', { status: 200 });
			}

			switch (event.type) {
				case 'checkout.session.completed': {
					if (!userId) break;
					if (object.mode === 'payment') {
						const credits = Number(metadata.credits ?? 0);
						if (credits > 0) {
							await billing.addTopup(userId, credits, {
								description: `Закупен пакет ${metadata.packId ?? ''}`.trim(),
								stripeEventId: event.id,
							});
						}
					} else if (object.mode === 'subscription' && customerId) {
						await billing.setStripeCustomerId(userId, customerId);
						// Планът се записва при `customer.subscription.*`, което
						// Stripe праща заедно с това събитие и носи периода.
					}
					break;
				}

				case 'customer.subscription.created':
				case 'customer.subscription.updated': {
					if (!userId) break;
					const planId = stripe.planFromSubscriptionObject(object);
					if (!planId) {
						BillingController.logger.warn('Непознат план в Stripe абонамент', {
							subscriptionId: object.id,
						});
						break;
					}
					await billing.setPlan(userId, planId, {
						status: StripeService.mapStatus(String(object.status ?? '')),
						stripeCustomerId: customerId ?? null,
						stripeSubscriptionId: typeof object.id === 'string' ? object.id : null,
						currentPeriodStart: toDate(object.current_period_start),
						currentPeriodEnd: toDate(object.current_period_end),
						cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
						stripeEventId: event.id,
					});
					break;
				}

				case 'customer.subscription.deleted': {
					if (!userId) break;
					await billing.setPlan(userId, 'free', {
						status: 'canceled',
						stripeSubscriptionId: null,
						cancelAtPeriodEnd: false,
						stripeEventId: event.id,
					});
					break;
				}

				case 'invoice.payment_failed': {
					if (!userId) break;
					const current = await billing.getPlanId(userId);
					await billing.setPlan(userId, current, {
						status: 'past_due',
						stripeEventId: event.id,
					});
					break;
				}

				default:
					// Останалите събития просто се записват като обработени.
					break;
			}

			return new Response('OK', { status: 200 });
		} catch (error) {
			BillingController.logger.error('Грешка при обработка на Stripe webhook', {
				error,
				type: event.type,
			});
			// 500 кара Stripe да опита пак — това е желаното поведение при
			// временен проблем с базата.
			return new Response('Грешка при обработка', { status: 500 });
		}
	}

	/** Създава Stripe клиент при първо плащане и го запомня. */
	private static async ensureCustomer(
		billing: BillingService,
		stripe: StripeService,
		user: { id: string; email: string; displayName?: string },
	): Promise<string> {
		const subscription = await billing.getOrCreateSubscription(user.id);
		if (subscription.stripeCustomerId) return subscription.stripeCustomerId;

		const customerId = await stripe.createCustomer({
			userId: user.id,
			email: user.email,
			name: user.displayName,
		});
		await billing.setStripeCustomerId(user.id, customerId);
		return customerId;
	}
}

/** Stripe праща времената като unix секунди. */
function toDate(value: unknown): Date | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return new Date(value * 1000);
}

export { InsufficientCreditsError };
