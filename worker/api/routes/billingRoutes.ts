/**
 * Billing Routes — планове, кредити, плащания.
 */

import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { BillingController } from '../controllers/billing/controller';

export function setupBillingRoutes(app: Hono<AppEnv>): void {
	// Публичен списък с плановете — нужен е и на нелогнатата ценова страница.
	app.get(
		'/api/billing/plans',
		setAuthLevel(AuthConfig.public),
		adaptController(BillingController, BillingController.getPlans),
	);

	// Резюме за екрана „Кредити“.
	app.get(
		'/api/billing/summary',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(BillingController, BillingController.getSummary),
	);

	// Stripe Checkout за абонамент.
	app.post(
		'/api/billing/checkout',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(BillingController, BillingController.createCheckout),
	);

	// Еднократна покупка на пакет кредити.
	app.post(
		'/api/billing/topup',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(BillingController, BillingController.createTopup),
	);

	// Портал за самообслужване (смяна на карта, отказ, фактури).
	app.post(
		'/api/billing/portal',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(BillingController, BillingController.createPortal),
	);

	// Stripe webhook. Публичен по необходимост — автентикацията е подписът,
	// затова маршрутът се регистрира директно, без adaptController.
	app.post('/api/billing/webhook', setAuthLevel(AuthConfig.public), (c) =>
		BillingController.handleWebhook(c.req.raw, c.env),
	);
}
