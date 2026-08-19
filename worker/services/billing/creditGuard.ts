/**
 * Тънък слой над `BillingService` за местата, където се харчат кредити.
 *
 * Държи на едно място решението „какво правим, ако кредитите свършат“ —
 * агентът, публикуването и създаването на проект отговарят еднакво.
 */

import { createLogger } from '../../logger';
import {
	BillingService,
	InsufficientCreditsError,
} from '../../database/services/BillingService';
import { CREDIT_COSTS, PLANS, type CreditAction } from '../../../shared/types/billing';

const logger = createLogger('CreditGuard');

export interface CreditChargeOutcome {
	ok: boolean;
	/** Съобщение на български, готово за показване на потребителя. */
	reason?: string;
	charged?: number;
	remaining?: number;
	/** Колко са били нужни — полезно за съобщението „трябват ти още N“. */
	required?: number;
}

/**
 * Опитва да изразходва кредити. Никога не хвърля — връща резултат, защото
 * извикващите са в потоци (WebSocket, стрийм), където хвърлянето би скъсало
 * връзката вместо да покаже разбираемо съобщение.
 */
export async function chargeCredits(
	env: Env,
	userId: string,
	action: CreditAction,
	options: { appId?: string | null; description?: string } = {},
): Promise<CreditChargeOutcome> {
	try {
		const billing = new BillingService(env);
		const result = await billing.charge(userId, action, options);
		return {
			ok: true,
			charged: result.charged,
			remaining: result.balance.totalAvailable,
		};
	} catch (error) {
		if (error instanceof InsufficientCreditsError) {
			return {
				ok: false,
				required: error.required,
				remaining: error.available,
				reason:
					`Нямаш достатъчно кредити за това действие (нужни ${error.required}, ` +
					`налични ${error.available}). Купи пакет или надгради плана си.`,
			};
		}
		// Проблем с базата не бива да спира работата на потребителя — по-добре
		// е да пропуснем таксуването, отколкото да блокираме генерирането.
		logger.error('Неуспешно таксуване на кредити', { error, userId, action });
		return { ok: true, charged: 0 };
	}
}

/** Връща вече изразходвани кредити (например при провалено генериране). */
export async function refundCredits(
	env: Env,
	userId: string,
	amount: number,
	options: { appId?: string | null; description?: string } = {},
): Promise<void> {
	if (amount <= 0) return;
	try {
		await new BillingService(env).refund(userId, amount, options);
	} catch (error) {
		logger.error('Неуспешно връщане на кредити', { error, userId, amount });
	}
}

/** Колко струва действието — за показване в UI-я преди потвърждение. */
export function costOf(action: CreditAction): number {
	return CREDIT_COSTS[action];
}

export interface ProjectLimitOutcome {
	ok: boolean;
	reason?: string;
	limit?: number | null;
	current?: number;
}

/**
 * Проверява лимита на активни проекти за плана на потребителя.
 * `countActiveProjects` се подава отвън, за да не влачим `AppService` тук.
 */
export async function checkProjectLimit(
	env: Env,
	userId: string,
	countActiveProjects: () => Promise<number>,
): Promise<ProjectLimitOutcome> {
	try {
		const billing = new BillingService(env);
		const planId = await billing.getPlanId(userId);
		const limit = PLANS[planId].maxActiveProjects;
		if (limit === null) return { ok: true, limit: null };

		const current = await countActiveProjects();
		if (current < limit) return { ok: true, limit, current };

		return {
			ok: false,
			limit,
			current,
			reason:
				`Планът ти позволява ${limit} активни проекта, а вече имаш ${current}. ` +
				'Надгради плана или архивирай проект.',
		};
	} catch (error) {
		logger.error('Неуспешна проверка на лимита за проекти', { error, userId });
		// При проблем не спираме потребителя.
		return { ok: true };
	}
}
