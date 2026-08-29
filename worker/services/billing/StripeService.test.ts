import { describe, it, expect } from 'vitest';
import { StripeService } from './StripeService';

/** Минимална среда — само това, което StripeService чете. */
function makeEnv(overrides: Record<string, string> = {}): Env {
	return {
		STRIPE_SECRET_KEY: 'sk_test_123',
		STRIPE_WEBHOOK_SECRET: 'whsec_test',
		STRIPE_PRICE_STARTER: 'price_starter',
		STRIPE_PRICE_PRO: 'price_pro',
		STRIPE_PRICE_TEAM: 'price_team',
		STRIPE_PRICE_PACK_100: 'price_pack_100',
		...overrides,
	} as unknown as Env;
}

/** Пресъздава подписа, който Stripe слага в заглавката. */
async function signPayload(secret: string, timestamp: number, payload: string) {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		encoder.encode(`${timestamp}.${payload}`),
	);
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

describe('StripeService.isEnabled', () => {
	it('е изключен без таен ключ', () => {
		expect(StripeService.isEnabled({} as Env)).toBe(false);
	});

	it('е включен, когато ключът е зададен', () => {
		expect(StripeService.isEnabled(makeEnv())).toBe(true);
	});
});

describe('съответствие между планове и Stripe цени', () => {
	it('намира цената на платен план', () => {
		const stripe = new StripeService(makeEnv());
		expect(stripe.priceIdForPlan('pro')).toBe('price_pro');
	});

	it('няма цена за безплатния план', () => {
		const stripe = new StripeService(makeEnv());
		expect(stripe.priceIdForPlan('free')).toBeNull();
	});

	it('връща null за план без настроена цена', () => {
		const stripe = new StripeService(makeEnv({ STRIPE_PRICE_TEAM: '' }));
		expect(stripe.priceIdForPlan('team')).toBeNull();
	});

	it('намира плана обратно по цена', () => {
		const stripe = new StripeService(makeEnv());
		expect(stripe.planIdForPrice('price_starter')).toBe('starter');
		expect(stripe.planIdForPrice('price_unknown')).toBeNull();
	});

	it('намира пакета кредити по цена', () => {
		const stripe = new StripeService(makeEnv());
		expect(stripe.packForPrice('price_pack_100')?.credits).toBe(100);
		expect(stripe.packForPrice('price_pack_999')).toBeNull();
	});
});

describe('StripeService.mapStatus', () => {
	it('превежда статусите на Stripe към нашите', () => {
		expect(StripeService.mapStatus('active')).toBe('active');
		expect(StripeService.mapStatus('trialing')).toBe('trialing');
		expect(StripeService.mapStatus('unpaid')).toBe('past_due');
		expect(StripeService.mapStatus('past_due')).toBe('past_due');
		expect(StripeService.mapStatus('canceled')).toBe('canceled');
		expect(StripeService.mapStatus('incomplete_expired')).toBe('canceled');
		expect(StripeService.mapStatus('нещо ново')).toBe('incomplete');
	});
});

describe('план от Stripe абонамент', () => {
	it('предпочита метаданните пред цената', () => {
		const stripe = new StripeService(makeEnv());
		const plan = stripe.planFromSubscriptionObject({
			metadata: { planId: 'team' },
			items: { data: [{ price: { id: 'price_pro' } }] },
		});
		expect(plan).toBe('team');
	});

	it('пада обратно на цената, ако метаданните липсват', () => {
		const stripe = new StripeService(makeEnv());
		expect(
			stripe.planFromSubscriptionObject({
				items: { data: [{ price: { id: 'price_pro' } }] },
			}),
		).toBe('pro');
	});

	it('връща null, когато нищо не съвпада', () => {
		const stripe = new StripeService(makeEnv());
		expect(stripe.planFromSubscriptionObject({})).toBeNull();
	});
});

describe('проверка на webhook подписа', () => {
	const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });

	it('приема валиден и пресен подпис', async () => {
		const stripe = new StripeService(makeEnv());
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = await signPayload('whsec_test', timestamp, payload);

		const event = await stripe.constructEvent(payload, `t=${timestamp},v1=${signature}`);
		expect(event.id).toBe('evt_1');
	});

	it('отхвърля подправен подпис', async () => {
		const stripe = new StripeService(makeEnv());
		const timestamp = Math.floor(Date.now() / 1000);

		await expect(
			stripe.constructEvent(payload, `t=${timestamp},v1=${'0'.repeat(64)}`),
		).rejects.toThrow('Невалиден Stripe подпис');
	});

	it('отхвърля подпис с изтекла времева марка', async () => {
		const stripe = new StripeService(makeEnv());
		const stale = Math.floor(Date.now() / 1000) - 3600;
		const signature = await signPayload('whsec_test', stale, payload);

		await expect(
			stripe.constructEvent(payload, `t=${stale},v1=${signature}`),
		).rejects.toThrow('изтекла времева марка');
	});

	it('отхвърля заглавка без подпис', async () => {
		const stripe = new StripeService(makeEnv());
		await expect(stripe.constructEvent(payload, 't=123')).rejects.toThrow(
			'Липсва валиден Stripe подпис',
		);
	});

	it('приема, ако поне един от няколкото подписа съвпада', async () => {
		// Stripe праща по няколко v1 подписа при завъртане на тайната.
		const stripe = new StripeService(makeEnv());
		const timestamp = Math.floor(Date.now() / 1000);
		const good = await signPayload('whsec_test', timestamp, payload);

		const event = await stripe.constructEvent(
			payload,
			`t=${timestamp},v1=${'a'.repeat(64)},v1=${good}`,
		);
		expect(event.type).toBe('checkout.session.completed');
	});
});
