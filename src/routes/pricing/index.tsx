/**
 * Екран „Планове“ — цените и пакетите кредити.
 *
 * Работи и без вход: нелогнат посетител вижда плановете и бутонът го праща
 * към регистрация, а логнат отива директно към Stripe Checkout.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useT } from '@/i18n';
import { useBillingActions, useBillingPlans, useBillingSummary } from '@/hooks/use-billing';
import { VsButton, VsCard, VsEyebrow } from '@/components/vibeship/ui';
import { formatPrice, type PlanId } from '../../../shared/types/billing';
import { cn } from '@cloudflare/kumo';

const ENTERPRISE_KEYS = [
	'pricing.enterprise.sso',
	'pricing.enterprise.cloud',
	'pricing.enterprise.sla',
	'pricing.enterprise.training',
];

const FAQ_KEYS = [
	{ q: 'pricing.faq1.q', a: 'pricing.faq1.a' },
	{ q: 'pricing.faq2.q', a: 'pricing.faq2.a' },
	{ q: 'pricing.faq3.q', a: 'pricing.faq3.a' },
];

export default function PricingPage() {
	const t = useT();
	const navigate = useNavigate();
	const { user } = useAuth();
	const { plans, packs, stripeEnabled, loading } = useBillingPlans();
	const { summary } = useBillingSummary();
	const { startCheckout, startTopup, openPortal, pending, error } = useBillingActions();

	const currentPlan: PlanId = summary?.subscription.planId ?? 'free';

	const handleChoose = (planId: PlanId, purchasable: boolean) => {
		if (!user) {
			navigate(`/?intent=signup&plan=${planId}`);
			return;
		}
		if (planId === currentPlan) return;
		if (planId === 'free') {
			// Слизането до безплатния план минава през портала на Stripe,
			// за да може потребителят да види кога изтича платеният период.
			openPortal();
			return;
		}
		if (!purchasable) {
			toast.error(t('errors.generic'));
			return;
		}
		startCheckout(planId);
	};

	const orderedPlans = useMemo(() => plans, [plans]);

	return (
		<div className="vs-screen vs-scroll h-full overflow-y-auto">
			<title>Планове · Vibeship</title>
			<div className="mx-auto max-w-[1180px] px-6 py-9 sm:px-10">
				<header className="mb-8 text-center">
					<h1 className="m-0 mb-2 text-[30px] font-extrabold tracking-[-0.03em] text-vs-ink">
						{t('pricing.title')}
					</h1>
					<p className="m-0 text-[15px] text-vs-ink-3">{t('pricing.sub')}</p>
					{!stripeEnabled && !loading ? (
						<p className="mt-3 text-[12.5px] text-vs-ink-4">
							Плащанията не са включени в тази инсталация — работи само
							безплатният план.
						</p>
					) : null}
					{error ? (
						<p className="mt-3 text-[12.5px] text-vs-red">{error}</p>
					) : null}
				</header>

				<div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{orderedPlans.map((plan) => {
						const isCurrent = plan.id === currentPlan;
						const highlighted = plan.highlighted;
						return (
							<div
								key={plan.id}
								className={cn(
									'relative flex flex-col rounded-[16px] border p-[22px_19px]',
									highlighted
										? 'border-vs-orange-line bg-[rgba(255,107,61,.06)]'
										: 'border-vs-line bg-vs-card',
								)}
							>
								{highlighted ? (
									<span className="absolute -top-2.5 left-[19px] rounded-[5px] bg-vs-orange px-2.5 py-1 text-[10.5px] font-extrabold tracking-[.06em] text-vs-on-orange">
										{t('pricing.mostPopular')}
									</span>
								) : null}

								<div className="mb-1.5 text-[16px] font-extrabold text-vs-ink">
									{t(plan.nameKey)}
								</div>
								<div className="min-h-9 text-[12.5px] leading-[1.5] text-vs-ink-3">
									{t(plan.whoKey)}
								</div>

								<div className="mt-3.5 mb-1 flex items-baseline gap-1.5">
									<span className="text-[30px] font-extrabold tracking-[-0.03em] text-vs-ink">
										{formatPrice(plan.priceCents, plan.currency)}
									</span>
									<span className="text-[12.5px] text-vs-ink-4">
										{t('common.perMonth')}
									</span>
								</div>
								<div className="vs-mono mb-4 text-[11.5px] text-vs-orange-soft">
									{plan.id === 'team'
										? t('pricing.sharedCredits', { count: plan.monthlyCredits })
										: t('pricing.monthlyCredits', { count: plan.monthlyCredits })}
								</div>

								<VsButton
									variant={
										isCurrent ? 'outline' : highlighted ? 'primary' : 'outline'
									}
									disabled={pending || isCurrent}
									onClick={() => handleChoose(plan.id, plan.purchasable)}
									className="mb-[18px] w-full text-center"
								>
									{isCurrent
										? plan.id === 'free'
											? t('pricing.currentChoice')
											: t('pricing.currentPlan')
										: t('pricing.choose', { plan: t(plan.nameKey) })}
								</VsButton>

								<ul className="m-0 flex list-none flex-col gap-2.5 p-0">
									{plan.featureKeys.map((key) => (
										<li
											key={key}
											className="flex gap-2.5 text-[12.5px] leading-[1.45] text-vs-ink-2"
										>
											<span className="text-vs-green">✓</span>
											{t(key)}
										</li>
									))}
								</ul>
							</div>
						);
					})}
				</div>

				{/* Пакети кредити — за когато месечната дажба свърши по-рано. */}
				{packs.length > 0 ? (
					<VsCard className="mb-3.5 p-[22px_24px]">
						<VsEyebrow>ПАКЕТИ КРЕДИТИ</VsEyebrow>
						<div className="flex flex-wrap gap-3">
							{packs.map((pack) => (
								<div
									key={pack.id}
									className="flex min-w-[220px] flex-1 items-center gap-3 rounded-[12px] border border-vs-line bg-vs-card-2 px-4 py-3.5"
								>
									<div>
										<div className="text-[14px] font-bold text-vs-ink">
											{pack.credits} {t('common.credits')}
										</div>
										<div className="vs-mono text-[11.5px] text-vs-ink-4">
											{formatPrice(pack.priceCents, pack.currency)} · еднократно
										</div>
									</div>
									<VsButton
										variant="accent"
										className="ml-auto"
										disabled={pending || !pack.purchasable || !user}
										onClick={() => startTopup(pack.id)}
									>
										{t('credits.buyPack')}
									</VsButton>
								</div>
							))}
						</div>
					</VsCard>
				) : null}

				{/* Enterprise */}
				<VsCard className="mb-3.5 grid items-center gap-8 border-vs-line bg-vs-panel p-[22px_24px] lg:grid-cols-[1.1fr_1fr]">
					<div>
						<VsEyebrow>{t('pricing.enterprise')}</VsEyebrow>
						<div className="mb-2 text-[20px] font-bold tracking-[-0.02em] text-vs-ink">
							{t('pricing.enterpriseTitle')}
						</div>
						<div className="text-[13.5px] leading-[1.6] text-vs-ink-3">
							{t('pricing.enterpriseBody')}
						</div>
					</div>
					<div className="flex flex-col gap-2.5">
						{ENTERPRISE_KEYS.map((key) => (
							<div
								key={key}
								className="flex gap-2.5 rounded-[10px] border border-vs-line bg-vs-card px-3.5 py-3 text-[13px] text-vs-ink-2"
							>
								<span className="text-vs-cyan">✓</span>
								{t(key)}
							</div>
						))}
						<a
							href="mailto:sales@vibeship.bg"
							className="rounded-[9px] bg-vs-orange px-4 py-2.5 text-center text-[13px] font-extrabold text-vs-on-orange no-underline hover:bg-vs-orange-hi"
						>
							{t('pricing.enterpriseCta')}
						</a>
					</div>
				</VsCard>

				{/* Често задавани въпроси */}
				<div className="grid gap-3 md:grid-cols-3">
					{FAQ_KEYS.map((item) => (
						<VsCard key={item.q} className="rounded-[12px] p-[16px_18px]">
							<div className="mb-[7px] text-[13.5px] font-bold text-vs-ink">
								{t(item.q)}
							</div>
							<div className="text-[12.5px] leading-[1.6] text-vs-ink-3">
								{t(item.a)}
							</div>
						</VsCard>
					))}
				</div>

				{user && summary?.subscription.managedByStripe ? (
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
