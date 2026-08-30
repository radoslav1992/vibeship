/**
 * Кукички за абонамента и кредитите.
 */

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type BillingPlansResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/auth-context';
import { appEvents } from '@/lib/app-events';
import type { BillingSummary } from '../../shared/types/billing';

async function fetchSummary(): Promise<BillingSummary> {
	const result = await apiClient.getBillingSummary();
	if (result.success && result.data) return result.data;
	throw new Error(result.error?.message || 'Неуспешно зареждане на кредитите');
}

async function fetchPlans(): Promise<BillingPlansResponse> {
	const result = await apiClient.getBillingPlans();
	if (result.success && result.data) return result.data;
	throw new Error(result.error?.message || 'Неуспешно зареждане на плановете');
}

/** Резюме на плана и кредитите на текущия потребител. */
export function useBillingSummary() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const enabled = !!user;

	const query = useQuery({
		queryKey: queryKeys.account.billing.summary(user?.id),
		queryFn: fetchSummary,
		enabled,
		// Кредитите се менят при всяко съобщение до агента — държим ги свежи,
		// но без да заливаме сървъра.
		staleTime: 15_000,
		// Връщането към таба е най-честият момент, в който салдото е остаряло.
		refetchOnWindowFocus: true,
	});

	// Създаването на проект удържа кредити на сървъра, а изтриването променя
	// колко активни проекта позволява планът. И в двата случая показаното
	// салдо трябва да се опресни веднага, а не след изтичане на staleTime.
	useEffect(() => {
		if (!enabled) return;
		const invalidate = () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.account.billing.summary(user?.id),
			});
		};
		const unsubscribeCreated = appEvents.on('app-created', invalidate);
		const unsubscribeDeleted = appEvents.on('app-deleted', invalidate);
		return () => {
			unsubscribeCreated();
			unsubscribeDeleted();
		};
	}, [enabled, queryClient, user?.id]);

	return {
		summary: query.data ?? null,
		loading: enabled && query.isLoading,
		error: query.error instanceof Error ? query.error.message : null,
		refetch: query.refetch,
	};
}

/** Плановете и пакетите — публично, работи и без вход. */
export function useBillingPlans() {
	const query = useQuery({
		queryKey: queryKeys.account.billing.plans(),
		queryFn: fetchPlans,
		staleTime: 5 * 60_000,
	});

	return {
		plans: query.data?.plans ?? [],
		packs: query.data?.packs ?? [],
		stripeEnabled: query.data?.stripeEnabled ?? false,
		loading: query.isLoading,
		error: query.error instanceof Error ? query.error.message : null,
	};
}

/**
 * Действия по плащане. Всяко връща адрес към Stripe, към който пренасочваме
 * браузъра — Checkout и порталът живеят при Stripe, не при нас.
 */
export function useBillingActions() {
	const queryClient = useQueryClient();
	const { user } = useAuth();

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: queryKeys.account.billing.summary(user?.id),
		});
	}, [queryClient, user?.id]);

	const checkout = useMutation({
		mutationFn: async (planId: string) => {
			const result = await apiClient.createBillingCheckout(planId);
			if (result.success && result.data?.url) return result.data.url;
			throw new Error(result.error?.message || 'Плащането не можа да започне');
		},
		onSuccess: (url) => {
			window.location.href = url;
		},
	});

	const topup = useMutation({
		mutationFn: async (packId: string) => {
			const result = await apiClient.createBillingTopup(packId);
			if (result.success && result.data?.url) return result.data.url;
			throw new Error(result.error?.message || 'Покупката не можа да започне');
		},
		onSuccess: (url) => {
			window.location.href = url;
		},
	});

	const portal = useMutation({
		mutationFn: async () => {
			const result = await apiClient.createBillingPortal();
			if (result.success && result.data?.url) return result.data.url;
			throw new Error(result.error?.message || 'Порталът не е достъпен');
		},
		onSuccess: (url) => {
			window.location.href = url;
		},
	});

	return {
		startCheckout: checkout.mutate,
		startTopup: topup.mutate,
		openPortal: portal.mutate,
		pending: checkout.isPending || topup.isPending || portal.isPending,
		error:
			(checkout.error ?? topup.error ?? portal.error) instanceof Error
				? ((checkout.error ?? topup.error ?? portal.error) as Error).message
				: null,
		refreshSummary: invalidate,
	};
}
