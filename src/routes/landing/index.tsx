/**
 * Начална страница за нелогнати посетители — представя Vibeship на български.
 *
 * Полето за идея тук е истинско: каквото се напише, се пренася към създаването
 * на проект веднага след вход, вместо да се загуби.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useT } from '@/i18n';
import { VibeshipLogo, VsButton, VsCard, VsEyebrow } from '@/components/vibeship/ui';
import { PLANS } from '../../../shared/types/billing';

const FEATURES = [
	{ icon: '◈', title: 'landing.feature1.title', body: 'landing.feature1.body' },
	{ icon: '⑂', title: 'landing.feature2.title', body: 'landing.feature2.body' },
	{ icon: '▲', title: 'landing.feature3.title', body: 'landing.feature3.body' },
];

const USE_CASES = [
	{ n: '01', title: 'landing.useCase1.title', body: 'landing.useCase1.body' },
	{ n: '02', title: 'landing.useCase2.title', body: 'landing.useCase2.body' },
	{ n: '03', title: 'landing.useCase3.title', body: 'landing.useCase3.body' },
];

export default function LandingPage() {
	const t = useT();
	const navigate = useNavigate();
	const { requireAuth } = useAuthGuard();
	const [idea, setIdea] = useState('');

	const startBuilding = (event?: FormEvent) => {
		event?.preventDefault();
		const query = idea.trim();
		const intendedUrl = query
			? `/chat/new?query=${encodeURIComponent(query)}&projectType=app&behaviorType=think`
			: '/';

		// Гост първо влиза; въведената идея пътува с него през `intendedUrl`,
		// за да не я пише пак.
		if (
			!requireAuth({
				requireFullAuth: true,
				actionContext: 'за да създадеш приложение',
				intendedUrl,
			})
		) {
			return;
		}

		if (query) navigate(intendedUrl, { state: { fromPrompt: true } });
	};

	const signIn = () =>
		requireAuth({ requireFullAuth: true, actionContext: 'за да продължиш' });

	return (
		<div className="vs-screen vs-scroll h-full overflow-y-auto">
			<title>Vibeship — от идея на български до приложение в Cloudflare</title>

			{/* Горна лента */}
			<div className="mx-auto flex max-w-[1180px] items-center gap-7 px-6 pt-6 sm:px-10">
				<VibeshipLogo to={null} />
				<nav className="hidden gap-[22px] text-[13.5px] font-semibold text-vs-ink-3 md:flex">
					<span className="cursor-pointer hover:text-vs-ink">{t('nav.howItWorks')}</span>
					<span
						className="cursor-pointer hover:text-vs-ink"
						onClick={() => navigate('/pricing')}
					>
						{t('nav.pricing')}
					</span>
					<span
						className="cursor-pointer hover:text-vs-ink"
						onClick={() => navigate('/discover')}
					>
						{t('nav.examples')}
					</span>
					<a
						className="text-vs-ink-3 no-underline hover:text-vs-ink"
						href="https://developers.cloudflare.com/workers/"
						target="_blank"
						rel="noreferrer"
					>
						{t('nav.docs')}
					</a>
				</nav>
				<div className="ml-auto flex items-center gap-3">
					<button
						onClick={signIn}
						className="cursor-pointer border-0 bg-transparent text-[13.5px] font-semibold text-vs-ink-2"
					>
						{t('common.signIn')}
					</button>
					<VsButton onClick={signIn}>{t('common.tryFree')}</VsButton>
				</div>
			</div>

			{/* Герой */}
			<div className="mx-auto max-w-[1180px] px-6 pt-[74px] text-center sm:px-10">
				<div className="mb-[26px] inline-flex items-center gap-2 rounded-[20px] border border-vs-orange-line bg-[rgba(255,107,61,.08)] px-3.5 py-1.5 text-[12px] font-semibold text-vs-orange-soft">
					{t('landing.badge')}
				</div>
				<h1 className="mx-auto mb-[18px] max-w-[900px] text-[clamp(38px,6vw,62px)] font-extrabold leading-[1.04] tracking-[-0.045em] text-balance text-vs-ink">
					{t('landing.headline1')}
					<br />
					<span className="text-vs-orange">{t('landing.headline2')}</span>{' '}
					{t('landing.headline3')}
				</h1>
				<p className="mx-auto mb-[30px] max-w-[620px] text-[17px] leading-[1.6] text-pretty text-vs-ink-3">
					{t('landing.sub')}
				</p>

				<form
					onSubmit={startBuilding}
					className="mx-auto max-w-[760px] rounded-[16px] border border-vs-line-2 bg-vs-card p-4 pb-3 text-left shadow-[0_24px_60px_rgba(0,0,0,.45)]"
				>
					<textarea
						value={idea}
						onChange={(event) => setIdea(event.target.value)}
						rows={2}
						placeholder={t('landing.promptExample')}
						className="min-h-[56px] w-full resize-none border-0 bg-transparent text-[15.5px] leading-[1.6] text-vs-ink outline-none placeholder:text-[#5C6470]"
						onKeyDown={(event) => {
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault();
								startBuilding();
							}
						}}
					/>
					<div className="flex flex-wrap items-center gap-2 border-t border-vs-line pt-3">
						<span className="rounded-[8px] border border-vs-line-2 px-2.5 py-1.5 text-[12px] font-semibold text-vs-ink-3">
							{t('landing.attachMock')}
						</span>
						<span className="rounded-[8px] border border-vs-line-2 px-2.5 py-1.5 text-[12px] font-semibold text-vs-ink-3">
							{t('landing.d1')}
						</span>
						<span className="vs-mono ml-auto text-[11px] text-vs-ink-4">
							{t('landing.freeCredits', { count: PLANS.free.monthlyCredits })}
						</span>
						<VsButton type="submit">{t('common.createArrow')}</VsButton>
					</div>
				</form>

				<div className="mt-[22px] flex flex-wrap justify-center gap-[26px] text-[12.5px] text-vs-ink-4">
					<span>{t('landing.noCard')}</span>
					<span>{t('landing.yourCode')}</span>
					<span>{t('landing.yourHosting')}</span>
				</div>
			</div>

			{/* Предимства */}
			<div className="mx-auto mt-[66px] max-w-[1180px] px-6 sm:px-10">
				<div className="grid gap-4 md:grid-cols-3">
					{FEATURES.map((feature) => (
						<VsCard key={feature.title} className="p-[22px]">
							<div className="mb-3 text-[19px] text-vs-orange">{feature.icon}</div>
							<div className="mb-2 text-[15.5px] font-bold text-vs-ink">
								{t(feature.title)}
							</div>
							<div className="text-[13.5px] leading-[1.65] text-vs-ink-3">
								{t(feature.body)}
							</div>
						</VsCard>
					))}
				</div>
			</div>

			{/* За кого е */}
			<div className="mx-auto mt-[30px] max-w-[1180px] px-6 pb-[70px] sm:px-10">
				<VsCard className="grid items-center gap-10 rounded-[16px] bg-vs-panel p-[30px_32px] lg:grid-cols-[1fr_1.2fr]">
					<div>
						<VsEyebrow>{t('landing.forWhom')}</VsEyebrow>
						<div className="mb-3.5 text-[22px] font-bold leading-[1.3] tracking-[-0.02em] text-vs-ink">
							{t('landing.forWhomTitle')}
						</div>
						<VsButton onClick={signIn}>{t('common.startNow')}</VsButton>
					</div>
					<div className="flex flex-col gap-2.5">
						{USE_CASES.map((useCase) => (
							<div
								key={useCase.n}
								className="flex gap-3 rounded-[11px] border border-vs-line bg-vs-card px-4 py-3.5"
							>
								<span className="vs-mono pt-0.5 text-[11px] text-vs-orange">
									{useCase.n}
								</span>
								<div>
									<div className="mb-1 text-[14px] font-bold text-vs-ink">
										{t(useCase.title)}
									</div>
									<div className="text-[13px] leading-[1.55] text-vs-ink-3">
										{t(useCase.body)}
									</div>
								</div>
							</div>
						))}
					</div>
				</VsCard>
			</div>
		</div>
	);
}
