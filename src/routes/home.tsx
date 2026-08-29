/**
 * Началният екран.
 *
 * Нелогнат посетител вижда представянето на Vibeship; влезлият потребител
 * попада направо на проектите си, защото това е екранът, от който работи.
 */

import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import LandingPage from './landing';
import ProjectsPage from './projects';

export default function Home() {
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();

	// Грешките от OAuth препращането се показват тук, защото callback-ът
	// винаги връща потребителя на началната страница.
	useEffect(() => {
		const authError = searchParams.get('error');
		if (!authError) return;

		const messages: Record<string, string> = {
			email_exists:
				'Вече има профил с този имейл. Влез с досегашния си начин, после свържи доставчика от настройките.',
			oauth_failed: 'Доставчикът за вход върна грешка. Опитай пак.',
			auth_failed: 'Входът не успя. Опитай пак.',
		};
		toast.error(messages[authError] ?? messages.auth_failed);
		searchParams.delete('error');
		setSearchParams(searchParams, { replace: true });
	}, [searchParams, setSearchParams]);

	return user ? <ProjectsPage /> : <LandingPage />;
}
