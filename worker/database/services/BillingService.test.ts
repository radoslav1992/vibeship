import { describe, it, expect } from 'vitest';
import { allocateSpend } from './BillingService';
import {
	CREDIT_COSTS,
	CREDIT_PACKS,
	PLANS,
	PLAN_ORDER,
	formatPrice,
	isPlanId,
} from '../../../shared/types/billing';

const balance = (
	monthlyAllowance: number,
	monthlyUsed: number,
	rolloverCredits: number,
	topupCredits: number,
) => ({ monthlyAllowance, monthlyUsed, rolloverCredits, topupCredits });

describe('allocateSpend', () => {
	it('харчи първо от месечната дажба', () => {
		expect(allocateSpend(balance(250, 0, 40, 100), 10)).toEqual({
			fromMonthly: 10,
			fromRollover: 0,
			fromTopup: 0,
			shortfall: 0,
		});
	});

	it('минава към пренесените, щом месечните свършат', () => {
		expect(allocateSpend(balance(250, 248, 40, 100), 10)).toEqual({
			fromMonthly: 2,
			fromRollover: 8,
			fromTopup: 0,
			shortfall: 0,
		});
	});

	it('стига до купените едва след пренесените', () => {
		expect(allocateSpend(balance(5, 5, 3, 100), 10)).toEqual({
			fromMonthly: 0,
			fromRollover: 3,
			fromTopup: 7,
			shortfall: 0,
		});
	});

	it('отчита недостиг, вместо да харчи повече от наличното', () => {
		expect(allocateSpend(balance(5, 5, 1, 2), 10)).toEqual({
			fromMonthly: 0,
			fromRollover: 1,
			fromTopup: 2,
			shortfall: 7,
		});
	});

	it('не харчи нищо при нулева цена', () => {
		expect(allocateSpend(balance(250, 0, 40, 100), 0)).toEqual({
			fromMonthly: 0,
			fromRollover: 0,
			fromTopup: 0,
			shortfall: 0,
		});
	});

	it('пренебрегва отрицателни салда, вместо да произведе кредити', () => {
		// Отрицателна кофа не бива да добавя към покритието на разхода.
		expect(allocateSpend(balance(0, 0, -5, 4), 6)).toEqual({
			fromMonthly: 0,
			fromRollover: 0,
			fromTopup: 4,
			shortfall: 2,
		});
	});
});

describe('дефиниции на плановете', () => {
	it('покрива всички планове от подредбата', () => {
		for (const id of PLAN_ORDER) {
			expect(PLANS[id]).toBeDefined();
			expect(PLANS[id].id).toBe(id);
		}
	});

	it('дава по-големи дажби на по-скъпите планове', () => {
		const prices = PLAN_ORDER.map((id) => PLANS[id].priceCents);
		const credits = PLAN_ORDER.map((id) => PLANS[id].monthlyCredits);
		expect(prices).toEqual([...prices].sort((a, b) => a - b));
		expect(credits).toEqual([...credits].sort((a, b) => a - b));
	});

	it('дава Stripe цена на всеки платен план и на нито един безплатен', () => {
		expect(PLANS.free.stripePriceEnvKey).toBeUndefined();
		for (const id of PLAN_ORDER.filter((plan) => plan !== 'free')) {
			expect(PLANS[id].stripePriceEnvKey).toBeTruthy();
		}
	});

	it('маркира точно един план като най-избиран', () => {
		const highlighted = PLAN_ORDER.filter((id) => PLANS[id].highlighted);
		expect(highlighted).toEqual(['pro']);
	});

	it('разпознава валидни идентификатори на планове', () => {
		expect(isPlanId('pro')).toBe(true);
		expect(isPlanId('enterprise')).toBe(false);
	});
});

describe('цени и цени на действията', () => {
	it('форматира кръгли и некръгли суми', () => {
		expect(formatPrice(0)).toBe('0 €');
		expect(formatPrice(1900)).toBe('19 €');
		expect(formatPrice(2450)).toBe('24.50 €');
	});

	it('прави публикуването по-скъпо от едно съобщение', () => {
		expect(CREDIT_COSTS.deploy).toBeGreaterThan(CREDIT_COSTS.message);
		expect(CREDIT_COSTS.create).toBeGreaterThan(CREDIT_COSTS.deploy);
	});

	it('прави по-големия пакет по-изгоден на кредит', () => {
		const perCredit = CREDIT_PACKS.map((pack) => pack.priceCents / pack.credits);
		expect(perCredit).toEqual([...perCredit].sort((a, b) => b - a));
	});
});
