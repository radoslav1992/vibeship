import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react';
import { bg } from './bg';
import { en } from './en';
import {
	DEFAULT_LOCALE,
	LOCALES,
	type Dictionary,
	type Locale,
	type TranslationVars,
} from './types';

export type { Locale } from './types';
export { LOCALES, DEFAULT_LOCALE } from './types';

const DICTIONARIES: Record<Locale, Dictionary> = { bg, en };

const STORAGE_KEY = 'vibeship.locale';

/** Формати за дати и числа по език. */
const INTL_LOCALE: Record<Locale, string> = { bg: 'bg-BG', en: 'en-GB' };

function readStoredLocale(): Locale {
	if (typeof window === 'undefined') return DEFAULT_LOCALE;
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (stored && (LOCALES as string[]).includes(stored)) {
			return stored as Locale;
		}
		// Ако браузърът е на български, започваме на български; иначе пак
		// оставаме на български — това е платформа за български потребители,
		// английският е само за екипи със смесен състав.
		return DEFAULT_LOCALE;
	} catch {
		return DEFAULT_LOCALE;
	}
}

/**
 * Заменя `{name}` плейсхолдъри в преведения низ.
 */
function interpolate(template: string, vars?: TranslationVars): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (match, key: string) => {
		const value = vars[key];
		return value === undefined ? match : String(value);
	});
}

export interface I18nValue {
	locale: Locale;
	setLocale: (locale: Locale) => void;
	/** Превежда ключ; при липсващ ключ връща самия ключ, за да личи пропускът. */
	t: (key: string, vars?: TranslationVars) => string;
	/** Форматира число по правилата на текущия език. */
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
	/** Форматира дата (по подразбиране „19 авг 2026“). */
	formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
	/** Относително време — „преди 4 мин“, „вчера“. */
	formatRelative: (value: Date | string | number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

	useEffect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.lang = locale;
		}
	}, [locale]);

	const setLocale = useCallback((next: Locale) => {
		setLocaleState(next);
		try {
			window.localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Липсващ localStorage (частен режим) не е причина да спрем.
		}
	}, []);

	const value = useMemo<I18nValue>(() => {
		const dict = DICTIONARIES[locale];
		const fallback = DICTIONARIES[DEFAULT_LOCALE];
		const intl = INTL_LOCALE[locale];

		const t = (key: string, vars?: TranslationVars) => {
			const template = dict[key] ?? fallback[key] ?? key;
			return interpolate(template, vars);
		};

		const formatNumber = (n: number, options?: Intl.NumberFormatOptions) =>
			new Intl.NumberFormat(intl, options).format(n);

		const formatDate = (
			input: Date | string | number,
			options: Intl.DateTimeFormatOptions = {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			},
		) => new Intl.DateTimeFormat(intl, options).format(new Date(input));

		const formatRelative = (input: Date | string | number) => {
			const date = new Date(input);
			const diffMs = Date.now() - date.getTime();
			const rtf = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' });
			const minutes = Math.round(diffMs / 60000);
			if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
			const hours = Math.round(minutes / 60);
			if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
			const days = Math.round(hours / 24);
			if (Math.abs(days) < 30) return rtf.format(-days, 'day');
			const months = Math.round(days / 30);
			if (Math.abs(months) < 12) return rtf.format(-months, 'month');
			return rtf.format(-Math.round(months / 12), 'year');
		};

		return { locale, setLocale, t, formatNumber, formatDate, formatRelative };
	}, [locale, setLocale]);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Достъп до езиковия слой. Работи и извън `I18nProvider` — тогава просто
 * ползва българския речник, за да не гърми при изолирано рендиране (тестове,
 * Storybook и подобни).
 */
export function useI18n(): I18nValue {
	const ctx = useContext(I18nContext);
	if (ctx) return ctx;
	const dict = DICTIONARIES[DEFAULT_LOCALE];
	const intl = INTL_LOCALE[DEFAULT_LOCALE];
	return {
		locale: DEFAULT_LOCALE,
		setLocale: () => {},
		t: (key, vars) => interpolate(dict[key] ?? key, vars),
		formatNumber: (n, o) => new Intl.NumberFormat(intl, o).format(n),
		formatDate: (v, o) =>
			new Intl.DateTimeFormat(
				intl,
				o ?? { day: 'numeric', month: 'long', year: 'numeric' },
			).format(new Date(v)),
		formatRelative: (v) => new Date(v).toLocaleDateString(intl),
	};
}

/** Кратък достъп само до `t`, който е нужен в повечето компоненти. */
export function useT() {
	return useI18n().t;
}
