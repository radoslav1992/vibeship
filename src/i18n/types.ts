/**
 * Типове за езиковия слой на Vibeship.
 *
 * Български е основният език на платформата; английският е резервен, за да
 * може всеки ключ да се покаже смислено дори преди да бъде преведен.
 */
export type Locale = 'bg' | 'en';

export const LOCALES: Locale[] = ['bg', 'en'];

export const DEFAULT_LOCALE: Locale = 'bg';

/** Речникът е плосък: ключ с точки → готов низ. */
export type Dictionary = Record<string, string>;

/** Стойности за заместване на `{name}` плейсхолдъри. */
export type TranslationVars = Record<string, string | number>;
