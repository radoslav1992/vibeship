/**
 * Екран „Моите проекти“ — началната страница за влезли потребители.
 *
 * Отгоре е полето за нова идея, отдолу — проектите на потребителя, така
 * както са в дизайна.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { useBillingSummary } from '@/hooks/use-billing';
import { useI18n, useT } from '@/i18n';
import { VsBadge, VsButton, VsCard, VsEmpty } from '@/components/vibeship/ui';
import { CREDIT_COSTS } from '../../../shared/types/billing';
import { cn } from '@cloudflare/kumo';

type Filter = 'all' | 'live' | 'draft';

const TEMPLATE_KEYS = [
	{ key: 'projects.template.shop', prompt: 'Онлайн магазин с каталог, количка и плащане с карта' },
	{ key: 'projects.template.crm', prompt: 'Вътрешно CRM с клиенти, сделки и задачи' },
	{ key: 'projects.template.landing', prompt: 'Лендинг страница с форма за запитване и админ преглед' },
	{ key: 'projects.template.rag', prompt: 'AI чатбот с RAG върху качени документи' },
	{ key: 'projects.template.dashboard', prompt: 'Табло с отчети и графики върху D1 база' },
];

/** Проект се брои за публикуван, ако има адрес от последното публикуване. */
function isLive(app: { deploymentId?: string | null; lastDeployedAt?: unknown }): boolean {
	return Boolean(app.deploymentId);
}

export default function ProjectsPage() {
	const t = useT();
	const { formatRelative } = useI18n();
	const navigate = useNavigate();
	const { user } = useAuth();
	const { summary } = useBillingSummary();
	const [idea, setIdea] = useState('');
	const [filter, setFilter] = useState<Filter>('all');

	const { apps, loading, error } = usePaginatedApps({
		type: 'user',
		defaultSort: 'recent',
		limit: 24,
	});

	const visibleApps = useMemo(() => {
		if (filter === 'all') return apps;
		return apps.filter((app) => {
			const live = isLive(app as { deploymentId?: string | null });
			return filter === 'live' ? live : !live;
		});
	}, [apps, filter]);

	const createProject = (event?: FormEvent, prompt?: string) => {
		event?.preventDefault();
		const query = (prompt ?? idea).trim();
		if (!query) return;
		navigate(
			`/chat/new?query=${encodeURIComponent(query)}&projectType=app&behaviorType=think`,
			{ state: { fromPrompt: true } },
		);
	};

	const firstName = user?.displayName?.split(' ')[0];

	return (
		<div className="vs-screen vs-scroll h-full overflow-y-auto">
			<title>Моите проекти · Vibeship</title>
			<div className="mx-auto max-w-[1140px] px-6 py-8 sm:px-10">
				<h1 className="m-0 mb-1.5 text-[28px] font-extrabold tracking-[-0.03em] text-vs-ink">
					{firstName
						? t('projects.greeting', { name: firstName })
						: t('projects.greetingAnon')}
				</h1>
				<p className="m-0 mb-[22px] text-[14.5px] text-vs-ink-3">
					{t('projects.sub')}
				</p>

				<form
					onSubmit={createProject}
					className="rounded-[15px] border border-vs-line-2 bg-vs-card p-[15px_15px_12px] shadow-[0_18px_40px_rgba(0,0,0,.32)]"
				>
					<input
						value={idea}
						onChange={(event) => setIdea(event.target.value)}
						placeholder={t('projects.placeholder')}
						className="w-full border-0 bg-transparent pb-5 pt-1.5 text-[15px] text-vs-ink outline-none placeholder:text-[#5C6470]"
					/>
					<div className="flex flex-wrap items-center gap-2 border-t border-vs-line pt-3">
						<span className="rounded-[8px] border border-vs-line-2 px-2.5 py-1.5 text-[12px] font-semibold text-vs-ink-3">
							{t('projects.mock')}
						</span>
						<span className="rounded-[8px] border border-vs-line-2 px-2.5 py-1.5 text-[12px] font-semibold text-vs-ink-3">
							{t('projects.d1')}
						</span>
						<span className="rounded-[8px] border border-vs-line-2 px-2.5 py-1.5 text-[12px] font-semibold text-vs-ink-3">
							{t('projects.workersAi')}
						</span>
						<span className="vs-mono ml-auto text-[11px] text-vs-ink-4">
							{t('projects.estimate', { count: CREDIT_COSTS.create })}
						</span>
						<VsButton type="submit" disabled={!idea.trim()}>
							{t('common.createArrow')}
						</VsButton>
					</div>
				</form>

				{/* Готови начала */}
				<div className="my-5 flex flex-wrap items-center gap-2">
					<span className="mr-1 text-[12.5px] text-vs-ink-3">
						{t('projects.startFrom')}
					</span>
					{TEMPLATE_KEYS.map((template) => (
						<button
							key={template.key}
							onClick={() => createProject(undefined, template.prompt)}
							className="cursor-pointer rounded-[20px] border border-vs-line-3 bg-vs-hover px-3.5 py-1.5 text-[12.5px] font-semibold text-vs-ink-2 hover:border-vs-orange"
						>
							{t(template.key)}
						</button>
					))}
				</div>

				{/* Списък с проекти */}
				<div className="mb-3.5 flex items-center justify-between">
					<div className="text-[15px] font-bold text-vs-ink">
						{t('projects.title')}{' '}
						<span className="font-medium text-vs-ink-4">{apps.length}</span>
					</div>
					<div className="flex gap-4 text-[12.5px] font-semibold text-vs-ink-3">
						{(
							[
								['all', 'projects.filterAll'],
								['live', 'projects.filterLive'],
								['draft', 'projects.filterDraft'],
							] as const
						).map(([value, label]) => (
							<button
								key={value}
								onClick={() => setFilter(value)}
								className={cn(
									'cursor-pointer border-0 border-b-2 bg-transparent pb-[3px]',
									filter === value
										? 'border-vs-orange text-vs-ink'
										: 'border-transparent text-vs-ink-3 hover:text-vs-ink',
								)}
							>
								{t(label)}
							</button>
						))}
					</div>
				</div>

				{error ? (
					<VsEmpty>{error}</VsEmpty>
				) : loading ? (
					<VsEmpty>{t('common.loading')}</VsEmpty>
				) : visibleApps.length === 0 ? (
					<VsEmpty>
						{apps.length === 0 ? t('projects.empty') : t('projects.emptyFiltered')}
					</VsEmpty>
				) : (
					<div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(262px,1fr))]">
						{visibleApps.map((app) => {
							const live = isLive(app as { deploymentId?: string | null });
							const generating = app.status === 'generating';
							return (
								<VsCard
									key={app.id}
									as="article"
									className="cursor-pointer overflow-hidden p-0 transition-colors hover:border-vs-line-hover"
								>
									<button
										onClick={() => navigate(`/chat/${app.id}`)}
										className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
									>
										<div className="grid h-[124px] place-items-center border-b border-vs-line bg-vs-card-2">
											{app.screenshotUrl ? (
												<img
													src={app.screenshotUrl}
													alt={app.title}
													className="size-full object-cover"
												/>
											) : (
												// Скелет вместо празно поле, докато няма снимка.
												<div className="flex h-[66%] w-[78%] flex-col gap-[5px] rounded-[7px] border border-vs-line-3 bg-vs-base p-2">
													<div className="h-1.5 w-[44%] rounded-[3px] bg-vs-orange opacity-85" />
													<div className="h-1 w-[76%] rounded-[3px] bg-vs-line-2" />
													<div className="h-1 w-[60%] rounded-[3px] bg-vs-line-2" />
													<div className="mt-auto flex gap-1">
														<div className="h-[13px] flex-1 rounded-[3px] bg-[#212630]" />
														<div className="h-[13px] flex-1 rounded-[3px] bg-[#212630]" />
														<div className="h-[13px] flex-1 rounded-[3px] bg-[#212630]" />
													</div>
												</div>
											)}
										</div>
										<div className="p-[13px_14px_14px]">
											<div className="mb-1.5 flex items-center gap-2">
												<span className="truncate text-[14px] font-bold text-vs-ink">
													{app.title}
												</span>
												<VsBadge
													className="ml-auto shrink-0"
													tone={generating ? 'test' : live ? 'live' : 'neutral'}
												>
													{generating
														? t('projects.statusBuilding')
														: live
															? t('projects.statusLive')
															: t('projects.statusDraft')}
												</VsBadge>
											</div>
											<div className="min-h-[37px] text-[12.5px] leading-[1.5] text-vs-ink-3">
												{app.description ?? ''}
											</div>
											<div className="vs-mono mt-2.5 flex gap-2.5 border-t border-vs-line pt-2.5 text-[10.5px] text-vs-ink-4">
												<span>
													{app.updatedAt ? formatRelative(app.updatedAt) : ''}
												</span>
												{app.framework ? (
													<span className="ml-auto">{app.framework}</span>
												) : null}
											</div>
										</div>
									</button>
								</VsCard>
							);
						})}
					</div>
				)}

				{summary && summary.balance.totalAvailable === 0 ? (
					<VsCard accent className="mt-6 flex items-center gap-4 p-4">
						<span className="text-[13.5px] text-vs-ink-2">
							{t('credits.exhausted')}
						</span>
						<VsButton className="ml-auto" onClick={() => navigate('/pricing')}>
							{t('common.upgrade')}
						</VsButton>
					</VsCard>
				) : null}
			</div>
		</div>
	);
}
