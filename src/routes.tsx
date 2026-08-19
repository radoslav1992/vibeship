import type { RouteObject } from 'react-router';

import App from './App';
import Home from './routes/home';
import Chat from './routes/chat/chat';
import Profile from './routes/profile';
import Settings from './routes/settings/index';
import AppsPage from './routes/apps';
import AppView from './routes/app';
import DiscoverPage from './routes/discover';
import PricingPage from './routes/pricing';
import CreditsPage from './routes/credits';
import ProjectsPage from './routes/projects';
import DeployPage from './routes/deploy';
import { ProtectedRoute } from './routes/protected-route';

const routes = [
	{
		path: '/',
		Component: App,
		children: [
			{
				index: true,
				Component: Home,
			},
			{
				path: 'chat/:chatId',
				Component: Chat,
			},
			{
				path: 'profile',
				element: (
					<ProtectedRoute>
						<Profile />
					</ProtectedRoute>
				),
			},
			{
				path: 'settings',
				element: (
					<ProtectedRoute>
						<Settings />
					</ProtectedRoute>
				),
			},
			{
				path: 'apps',
				element: (
					<ProtectedRoute>
						<AppsPage />
					</ProtectedRoute>
				),
			},
			{
				path: 'app/:id',
				Component: AppView,
			},
			{
				path: 'discover',
				Component: DiscoverPage,
			},
			{
				// Проектите на потребителя — същият екран, който вижда и на „/“.
				path: 'projects',
				element: (
					<ProtectedRoute>
						<ProjectsPage />
					</ProtectedRoute>
				),
			},
			{
				// Публикуване и GitHub за конкретен проект.
				path: 'deploy/:id',
				element: (
					<ProtectedRoute>
						<DeployPage />
					</ProtectedRoute>
				),
			},
			{
				path: 'credits',
				element: (
					<ProtectedRoute>
						<CreditsPage />
					</ProtectedRoute>
				),
			},
			{
				// Плановете са публични — цената е част от представянето.
				path: 'pricing',
				Component: PricingPage,
			},
		],
	},
] satisfies RouteObject[];

export { routes };
