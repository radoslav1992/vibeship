/**
 * Джобната сметка за кредити в страничната лента.
 *
 * Показва колко от месечната дажба е останала и води към плановете —
 * точно както е в дизайна.
 */

import { useNavigate } from 'react-router';
import { useT } from '@/i18n';
import { useBillingSummary } from '@/hooks/use-billing';
import { VsProgress } from './ui';

export function CreditsWidget({ collapsed = false }: { collapsed?: boolean }) {
	const t = useT();
	const navigate = useNavigate();
	const { summary, loading } = useBillingSummary();

	if (loading || !summary) return null;

	const { balance } = summary;
	const used = balance.monthlyUsed;
	const allowance = Math.max(1, balance.monthlyAllowance);
	const ratio = Math.min(1, used / allowance);

	if (collapsed) {
		return (
			<button
				onClick={() => navigate('/credits')}
				title={`${balance.totalAvailable} ${t('common.credits')}`}
				className="vs-mono cursor-pointer rounded-[8px] border border-vs-line bg-vs-card px-1.5 py-1 text-[10px] text-vs-ink-2"
			>
				{balance.totalAvailable}
			</button>
		);
	}

	return (
		<div className="rounded-[12px] border border-vs-line bg-vs-card p-3.5">
			<div className="mb-2 text-[12px] font-semibold text-vs-ink-3">
				{t('credits.title')}
			</div>
			<div className="vs-mono text-[19px] font-medium tracking-[-0.02em] text-vs-ink">
				{balance.totalAvailable}
				<span className="text-[13px] text-vs-ink-4"> / {balance.monthlyAllowance}</span>
			</div>
			<VsProgress
				className="my-2.5"
				segments={[{ value: ratio, color: 'linear-gradient(90deg, #FF6B3D, #FDBA74)' }]}
			/>
			<button
				onClick={() => navigate('/pricing')}
				className="w-full cursor-pointer rounded-[8px] border border-vs-orange-line bg-[rgba(255,107,61,.09)] py-[7px] text-center text-[12.5px] font-bold text-vs-orange-soft hover:bg-[rgba(255,107,61,.18)]"
			>
				{t('common.upgrade')}
			</button>
		</div>
	);
}
