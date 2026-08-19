/**
 * Екран „Публикуване и GitHub“ за конкретен проект.
 *
 * Показва състоянието на двете връзки, които правят проекта наистина „твой“ —
 * GitHub репото и Cloudflare акаунтът — и историята на публикуванията.
 */

import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { useLimitsContext } from '@/contexts/limits-context';
import { useI18n, useT } from '@/i18n';
import { startCloudflareConnect } from '@/lib/cloudflare-connect';
import { VsBadge, VsButton, VsCard, VsEmpty } from '@/components/vibeship/ui';
import { CREDIT_COSTS } from '../../../shared/types/billing';

export default function DeployPage() {
	const t = useT();
	const { formatRelative } = useI18n();
	const navigate = useNavigate();
	const { id } = useParams<{ id: string }>();
	const { app, loading, error } = useApp(id);
	const { data: limits } = useLimitsContext();

	const cloudflareAccount = limits?.cloudflareCredits?.accountName ?? null;
	const githubUrl = app?.githubRepositoryUrl ?? null;

	/** „mdrumeva/barberia“ от пълния адрес на репото. */
	const githubSlug = useMemo(() => {
		if (!githubUrl) return null;
		try {
			return new URL(githubUrl).pathname.replace(/^\/+|\.git$/g, '');
		} catch {
			return githubUrl;
		}
	}, [githubUrl]);

	if (loading) {
		return (
			<div className="vs-screen flex h-full items-center justify-center text-[13.5px] text-vs-ink-3">
				{t('common.loading')}
			</div>
		);
	}

	if (error || !app) {
		return (
			<div className="vs-screen flex h-full items-center justify-center p-10">
				<VsEmpty>{error ?? t('errors.notFound')}</VsEmpty>
			</div>
		);
	}

	const deployed = Boolean(app.cloudflareUrl);

	return (
		<div className="vs-screen vs-scroll h-full overflow-y-auto">
			<title>{`Публикуване · ${app.title}`}</title>
			<div className="mx-auto max-w-[900px] px-6 py-8 sm:px-10">
				<button
					onClick={() => navigate(`/chat/${app.id}`)}
					className="mb-3.5 flex cursor-pointer items-center gap-1.5 border-0 bg-transparent text-[12.5px] text-vs-ink-3 hover:text-vs-ink"
				>
					<ArrowLeft className="size-3.5" /> {app.title}
				</button>

				<h1 className="m-0 mb-1.5 text-[26px] font-extrabold tracking-[-0.025em] text-vs-ink">
					{t('deploy.title')}
				</h1>
				<p className="m-0 mb-6 text-vs-ink-3">{t('deploy.sub')}</p>

				<div className="mb-3.5 grid gap-3.5 md:grid-cols-2">
					{/* GitHub */}
					<VsCard className="p-[18px]">
						<div className="mb-3.5 flex items-center gap-2.5">
							<span className="text-[16px]">⑂</span>
							<span className="text-[14.5px] font-bold text-vs-ink">
								{t('deploy.github')}
							</span>
							<VsBadge className="ml-auto" tone={githubUrl ? 'live' : 'neutral'}>
								{githubUrl ? t('common.connected') : t('common.notConnected')}
							</VsBadge>
						</div>

						{githubUrl ? (
							<>
								<div className="vs-mono mb-1 text-[12.5px] text-vs-ink-2">
									{githubSlug}
								</div>
								<div className="vs-mono text-[11.5px] text-vs-ink-4">
									{t('deploy.githubBranch', {
										branch: 'main',
										when: app.updatedAt ? formatRelative(app.updatedAt) : '—',
									})}
								</div>
								<div className="mt-4 flex gap-2">
									<VsButton
										variant="outline"
										onClick={() => navigate(`/chat/${app.id}`)}
									>
										{t('deploy.githubChangeRepo')}
									</VsButton>
									<a
										href={githubUrl}
										target="_blank"
										rel="noreferrer"
										className="rounded-[9px] border border-vs-line-2 px-4 py-2.5 text-[13.5px] font-semibold text-vs-ink-2 no-underline hover:border-vs-line-hover"
									>
										{t('deploy.githubOpen')}
									</a>
								</div>
							</>
						) : (
							<>
								<p className="m-0 text-[13px] leading-[1.6] text-vs-ink-3">
									{t('deploy.githubNotConnected')}
								</p>
								<VsButton
									className="mt-4"
									onClick={() => navigate(`/chat/${app.id}?export=github`)}
								>
									{t('deploy.githubConnect')}
								</VsButton>
							</>
						)}
					</VsCard>

					{/* Cloudflare */}
					<VsCard className="p-[18px]">
						<div className="mb-3.5 flex items-center gap-2.5">
							<span className="text-[16px] text-vs-orange-soft">▲</span>
							<span className="text-[14.5px] font-bold text-vs-ink">
								{t('deploy.cloudflare')}
							</span>
							<VsBadge className="ml-auto" tone={cloudflareAccount ? 'live' : 'neutral'}>
								{cloudflareAccount ? t('common.connected') : t('common.notConnected')}
							</VsBadge>
						</div>

						{cloudflareAccount ? (
							<>
								<div className="vs-mono mb-1 text-[12.5px] text-vs-ink-2">
									{cloudflareAccount}
								</div>
								<div className="vs-mono text-[11.5px] text-vs-ink-4">
									Workers · регион Европа
								</div>
								<div className="mt-4 flex gap-2">
									<VsButton variant="outline" onClick={() => navigate('/settings')}>
										{t('deploy.cloudflareDomains')}
									</VsButton>
									<VsButton variant="outline" onClick={() => navigate('/settings')}>
										{t('deploy.cloudflareSecrets', { count: 0 })}
									</VsButton>
								</div>
							</>
						) : (
							<>
								<p className="m-0 text-[13px] leading-[1.6] text-vs-ink-3">
									{t('deploy.cloudflareNotConnected')}
								</p>
								<VsButton
									className="mt-4"
									onClick={() => void startCloudflareConnect(window.location.href)}
								>
									{t('deploy.cloudflareConnect')}
								</VsButton>
							</>
						)}
					</VsCard>
				</div>

				{/* Текущо състояние на публикуването */}
				<VsCard className="mb-3.5 p-[18px]">
					<div className="mb-4 flex items-center gap-3">
						<span className="text-[14.5px] font-bold text-vs-ink">
							{deployed ? t('deploy.history') : t('deploy.inProgress')}
						</span>
						<span className="vs-mono ml-auto text-[11px] text-vs-ink-4">
							{t('deploy.cost', { count: CREDIT_COSTS.deploy })}
						</span>
					</div>

					{deployed ? (
						<div className="flex flex-col gap-2.5">
							<div className="flex items-center gap-3 text-[13px]">
								<span className="text-vs-green">●</span>
								<a
									href={app.cloudflareUrl ?? undefined}
									target="_blank"
									rel="noreferrer"
									className="vs-mono text-[12.5px] text-vs-orange-soft no-underline hover:underline"
								>
									{app.cloudflareUrl}
								</a>
								<span className="vs-mono ml-auto text-[11.5px] text-vs-ink-4">
									{app.lastDeployedAt ? formatRelative(app.lastDeployedAt) : ''}
								</span>
							</div>
						</div>
					) : (
						<div className="text-[13px] text-vs-ink-3">
							{t('deploy.noDeploys')}
						</div>
					)}

					<VsButton
						className="mt-4"
						onClick={() => navigate(`/chat/${app.id}?action=deploy`)}
					>
						{t('deploy.start')}
					</VsButton>
				</VsCard>
			</div>
		</div>
	);
}
