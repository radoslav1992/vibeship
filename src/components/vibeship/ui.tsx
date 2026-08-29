/**
 * Малки градивни елементи по дизайна на Vibeship.
 *
 * Дизайнът е тъмен, с оранжев акцент и подчертано плоски повърхности —
 * държим стойностите тук, за да не се разпилеят по екраните.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@cloudflare/kumo';

/** Логото — квадратче с „V“ и името. */
export function VibeshipLogo({
	size = 'md',
	to = '/',
	badge,
}: {
	size?: 'sm' | 'md';
	to?: string | null;
	badge?: string;
}) {
	const box = size === 'sm' ? 'size-7 text-[15px] rounded-[9px]' : 'size-7 text-[15px] rounded-[9px]';
	const label = size === 'sm' ? 'text-[16.5px]' : 'text-[17px]';

	const content = (
		<span className="flex items-center gap-2.5">
			<span
				className={cn(
					'grid place-items-center font-extrabold text-vs-on-orange',
					box,
				)}
				style={{ background: 'linear-gradient(150deg, #FF6B3D, #C2410C)' }}
			>
				V
			</span>
			<span className={cn('font-extrabold tracking-[-0.02em] text-vs-ink', label)}>
				Vibeship
			</span>
			{badge ? (
				<span className="vs-mono rounded-[5px] border border-vs-line-2 px-1.5 py-0.5 text-[9px] text-vs-ink-4">
					{badge}
				</span>
			) : null}
		</span>
	);

	if (!to) return content;
	return (
		<Link to={to} className="flex items-center no-underline">
			{content}
		</Link>
	);
}

/** Плоска карта с рамка — основната повърхност в дизайна. */
export function VsCard({
	children,
	className,
	accent = false,
	as: Tag = 'div',
}: {
	children: ReactNode;
	className?: string;
	/** Оранжевата вариация, ползвана за призивите към действие. */
	accent?: boolean;
	as?: 'div' | 'section' | 'article';
}) {
	return (
		<Tag
			className={cn(
				'rounded-[14px] border',
				accent
					? 'border-vs-orange-line bg-[rgba(255,107,61,.07)]'
					: 'border-vs-line bg-vs-card',
				className,
			)}
		>
			{children}
		</Tag>
	);
}

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'accent';

/** Бутон в трите разновидности от дизайна. */
export function VsButton({
	children,
	onClick,
	variant = 'primary',
	className,
	disabled,
	type = 'button',
	title,
}: {
	children: ReactNode;
	onClick?: () => void;
	variant?: ButtonVariant;
	className?: string;
	disabled?: boolean;
	type?: 'button' | 'submit';
	title?: string;
}) {
	const styles: Record<ButtonVariant, string> = {
		primary:
			'bg-vs-orange text-vs-on-orange font-extrabold hover:bg-vs-orange-hi border border-vs-orange',
		accent:
			'border border-vs-orange-line bg-[rgba(255,107,61,.09)] text-vs-orange-soft font-bold hover:bg-[rgba(255,107,61,.18)]',
		outline:
			'border border-vs-line-2 text-vs-ink-2 font-semibold hover:border-vs-line-hover',
		ghost: 'text-vs-ink-3 font-semibold hover:text-vs-ink border border-transparent',
	};

	return (
		<button
			type={type}
			title={title}
			onClick={onClick}
			disabled={disabled}
			className={cn(
				'rounded-[9px] px-4 py-2.5 text-[13.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
				styles[variant],
				className,
			)}
		>
			{children}
		</button>
	);
}

/** Малък цветен етикет (статус на проект, състояние на връзка). */
export function VsBadge({
	children,
	tone = 'neutral',
	className,
}: {
	children: ReactNode;
	tone?: 'neutral' | 'live' | 'test' | 'danger' | 'brand';
	className?: string;
}) {
	const tones: Record<string, string> = {
		neutral: 'text-vs-ink-3 bg-vs-raised border-transparent',
		live: 'text-vs-green bg-[rgba(74,222,128,.1)] border-vs-green-line',
		test: 'text-vs-cyan bg-[rgba(103,232,249,.1)] border-transparent',
		danger: 'text-vs-red bg-[rgba(248,113,113,.1)] border-transparent',
		brand: 'text-vs-orange-soft bg-[rgba(255,107,61,.09)] border-vs-orange-line',
	};
	return (
		<span
			className={cn(
				'rounded-[5px] border px-[7px] py-[3px] text-[10.5px] font-bold tracking-[.04em]',
				tones[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}

/** Лента за напредък / изразходвани кредити. */
export function VsProgress({
	segments,
	className,
	height = 5,
}: {
	/** Всеки сегмент е дял от общото (0–1) плюс цвят. */
	segments: Array<{ value: number; color: string }>;
	className?: string;
	height?: number;
}) {
	return (
		<div
			className={cn('flex overflow-hidden rounded-[4px] bg-vs-line', className)}
			style={{ height }}
		>
			{segments.map((segment, index) => (
				<div
					key={index}
					style={{
						width: `${Math.max(0, Math.min(1, segment.value)) * 100}%`,
						background: segment.color,
					}}
				/>
			))}
		</div>
	);
}

/** Заглавие на секция с малките главни букви от дизайна. */
export function VsEyebrow({ children }: { children: ReactNode }) {
	return (
		<div className="mb-3 text-[11px] font-bold tracking-[.12em] text-vs-ink-5">
			{children}
		</div>
	);
}

/** Празно състояние — вместо мълчалив празен списък. */
export function VsEmpty({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-[14px] border border-dashed border-vs-line bg-vs-card px-6 py-10 text-center text-[13.5px] text-vs-ink-3">
			{children}
		</div>
	);
}
