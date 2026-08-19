/**
 * Екран „Кредити“ — колко са останали, за какво са отишли и как да се купят още.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useI18n, useT } from '@/i18n';
import { useBillingActions, useBillingPlans, useBillingSummary } from '@/hooks/use-billing';
import { VsButton, VsCard, VsEmpty, VsProgress } from '@/components/vibeship/ui';
import {
	CREDIT_PACKS,
	PLANS,
	formatPrice,
	type LedgerEntry,
} from '../../../shared/types/billing';

/** Превежда движение от дневника до текст на български. */
function describeEntry(entry: LedgerEntry, t: (key: string) => string): string {
	if (entry.description) return entry.description;
	switch (entry.kind) {
		case 'grant':
			return t('credits.action.grant');
		case 'rollover':
			return t('credits.action.rollover');
		case 'topup':
			return t('credits.action.topup');
		case 'refund':
			return t('credits.action.grant');
		case 'expire':
			return t('credits.action.rollover');
		default:
			break;
	}
	switch (entry.action) {
		case 'deploy':
			return t('credits.action.deploy');
		case 'create':
			return t('credits.action.create');
		case 'index':
			return t('credits.action.index');
		case 'generation':
			return t('credits.action.generation');
		default:
			return t('credits.action.message');
	}
}

export default function CreditsPage() {
	const t = useT();
	const { formatDate, formatNumber } = useI18n();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { summary, loading, refetch } = useBillingSummary();
	const { packs } = useBillingPlans();
	const { startTopup, openPortal, pending } = useBillingActions();

	// Връщане от Stripe: показваме резултата и презареждаме салдото, защото
	// webhook-ът може да е пристигнал секунда преди пренасочването.
	useEffect(() => {
		const checkout = searchParams.get('checkout');
		const topup = searchParams.get('topup');
		if (!checkout && !topup) return;

		if (checkout === 'success' || topup === 'success') {
			toast.success('Плащането мина успешно. Кредитите ти вече са начислени.');
			void refetch();
		} else if (checkout === 'cancelled' || topup === 'cancelled') {
			toast.info('Плащането беше прекратено.');
		}
		searchParams.delete('checkout');
		searchParams.delete('topup');
		setSearchParams(searchParams, { replace: true });
	}, [searchParams, setSearchParams, refetch]);

	const balance = summary?.balance;
	const usage = summary?.usage;

	/** Дневната диаграма: подреждаме всички дни от периода, дори празните. */
	const bars = useMemo(() => {
		if (!summary || !balance) return [];
		const start = new Date(balance.periodStart);
		const now = new Date();
		const byDate = new Map(summary.dailyUsage.map((point) => [point.date, point]));
		const days: Array<{ date: string; generation: number; deploy: number }> = [];

		for (
			let cursor = new Date(start);
			cursor <= now;
			cursor.setUTCDate(cursor.getUTCDate() + 1)
		) {
			const key = cursor.toISOString().slice(0, 10);
			days.push(byDate.get(key) ?? { date: key, generation: 0, deploy: 0 });
		}
		return days;
	}, [summary, balance]);

	const maxBar = useMemo(
		() => Math.max(1, ...bars.map((bar) => bar.generation + bar.deploy)),
		[bars],
	);

	const defaultPack = packs[0] ?? CREDIT_PACKS[0];

	if (loading || !summary || !balance || !usage) {
		return (
			<div className="vs-screen flex h-full items-center justify-center text-[13.5px] text-vs-ink-3">
				{t('common.loading')}
			</div>
		);
	}

	const plan = PLANS[summary.subscription.planId];
	const spentTotal = usage.generation + usage.deploy;
	const denominator = Math.max(1, balance.monthlyAllowance);

	return (
		<div className="vs-screen vs-scroll h-full overflow-y-auto">
			<title>Кредити · Vibeship</title>
			<div className="mx-auto max-w-[980px] px-6 py-8 sm:px-10">
				<h1 className="m-0 mb-1.5 text-[26px] font-extrabold tracking-[-0.025em] text-vs-ink">
					{t('credits.title')}
				</h1>
				<p className="m-0 mb-6 text-vs-ink-3">
					{t('credits.planRenews', {
						plan: t(plan.nameKey),
						date: formatDate(summary.subscription.currentPeriodEnd ?? balance.periodEnd),
					})}
				</p>

				<div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
					<VsCard className="p-5">
						<div className="flex items-baseline gap-2.5">
							<span className="vs-mono text-[34px] font-medium tracking-[-0.03em] text-vs-ink">
								{formatNumber(balance.totalAvailable)}
							</span>
							<span className="text-[15px] text-vs-ink-4">
								{t('credits.ofMonthly', { total: balance.monthlyAllowance })}
							</span>
						</div>

						<VsProgress
							className="my-3.5"
							height={8}
							segments={[
								{ value: usage.generation / denominator, color: '#FF6B3D' },
								{ value: usage.deploy / denominator, color: '#67E8F9' },
							]}
						/>

						<div className="flex flex-wrap gap-4 text-[12.5px] text-vs-ink-3">
							<span className="flex items-center gap-[7px]">
								<i className="size-2 rounded-[2px] bg-vs-orange" />
								{t('credits.legendGeneration', { count: usage.generation })}
							</span>
							<span className="flex items-center gap-[7px]">
								<i className="size-2 rounded-[2px] bg-vs-cyan" />
								{t('credits.legendDeploy', { count: usage.deploy })}
							</span>
							<span className="flex items-center gap-[7px]">
								<i className="size-2 rounded-[2px] bg-vs-line-2" />
								{t('credits.legendRemaining', { count: balance.monthlyRemaining })}
							</span>
						</div>

						{balance.rolloverCredits > 0 || balance.topupCredits > 0 ? (
							<div className="mt-3.5 flex flex-wrap gap-4 border-t border-vs-line pt-3.5 text-[12.5px] text-vs-ink-4">
								{balance.rolloverCredits > 0 ? (
									<span>{t('credits.rollover', { count: balance.rolloverCredits })}</span>
								) : null}
								{balance.topupCredits > 0 ? (
									<span>{t('credits.topupBalance', { count: balance.topupCredits })}</span>
								) : null}
							</div>
						) : null}
					</VsCard>

					<VsCard accent className="flex flex-col p-5">
						<div className="mb-1.5 text-[15px] font-bold text-vs-ink">
							{t('credits.runningOut')}
						</div>
						<div className="text-[13px] leading-[1.6] text-vs-ink-3">
							{t('credits.runningOutBody', {
								count: defaultPack.credits,
								price: formatPrice(defaultPack.priceCents, defaultPack.currency),
							})}
						</div>
						<div className="mt-auto flex gap-2 pt-4">
							<VsButton
								onClick={() => startTopup(defaultPack.id)}
								disabled={pending || !summary.stripeEnabled}
							>
								{t('credits.buyPack')}
							</VsButton>
							<VsButton variant="accent" onClick={() => navigate('/pricing')}>
								{t('credits.seePlans')}
							</VsButton>
						</div>
					</VsCard>
				</div>

				{/* Дневна употреба */}
				<VsCard className="mb-3.5 p-5">
					<div className="mb-[18px] text-[14px] font-bold text-vs-ink">
						{t('credits.dailyUsage', {
							month: formatDate(balance.periodStart, { month: 'long' }),
						})}
					</div>
					{spentTotal === 0 ? (
						<div className="py-6 text-center text-[13px] text-vs-ink-4">
							{t('credits.ledgerEmpty')}
						</div>
					) : (
						<>
							<div className="flex h-[118px] items-end gap-[5px]">
								{bars.map((bar) => (
									<div
										key={bar.date}
										title={`${bar.date}: ${bar.generation + bar.deploy}`}
										className="flex h-full flex-1 flex-col justify-end gap-[2px]"
									>
										<div
											className="rounded-t-[3px] bg-vs-orange opacity-90"
											style={{ height: `${(bar.generation / maxBar) * 100}%` }}
										/>
										<div
											className="rounded-b-[3px] bg-vs-cyan opacity-80"
											style={{ height: `${(bar.deploy / maxBar) * 100}%` }}
										/>
									</div>
								))}
							</div>
							<div className="vs-mono mt-2 flex justify-between text-[10.5px] text-vs-ink-5">
								<span>{bars[0]?.date.slice(8)}</span>
								<span>{bars[bars.length - 1]?.date.slice(8)}</span>
							</div>
						</>
					)}
				</VsCard>

				{/* Дневник на разходите */}
				<VsCard className="overflow-hidden p-0">
					<div className="border-b border-vs-line px-[18px] py-3.5 text-[14px] font-bold text-vs-ink">
						{t('credits.ledger')}
					</div>
					{summary.ledger.length === 0 ? (
						<div className="p-5">
							<VsEmpty>{t('credits.ledgerEmpty')}</VsEmpty>
						</div>
					) : (
						summary.ledger.map((entry) => (
							<div
								key={entry.id}
								className="grid grid-cols-[104px_1fr_1.2fr_64px] items-center gap-3.5 border-b border-[#1B1F26] px-[18px] py-3 text-[13px] last:border-b-0"
							>
								<span className="vs-mono text-[11.5px] text-vs-ink-4">
									{formatDate(entry.createdAt, {
										day: '2-digit',
										month: '2-digit',
										hour: '2-digit',
										minute: '2-digit',
									})}
								</span>
								<span className="truncate font-semibold text-vs-ink">
									{entry.appTitle ?? '—'}
								</span>
								<span className="truncate text-vs-ink-3">
									{describeEntry(entry, t)}
								</span>
								<span
									className={`vs-mono text-right ${
										entry.amount < 0 ? 'text-vs-orange-soft' : 'text-vs-green'
									}`}
								>
									{entry.amount < 0 ? '−' : '+'}
									{Math.abs(entry.amount)}
								</span>
							</div>
						))
					)}
				</VsCard>

				{summary.subscription.managedByStripe ? (
					<div className="mt-6 text-center">
						<VsButton variant="ghost" onClick={() => openPortal()} disabled={pending}>
							{t('pricing.manageBilling')}
						</VsButton>
					</div>
				) : null}
			</div>
		</div>
	);
}
