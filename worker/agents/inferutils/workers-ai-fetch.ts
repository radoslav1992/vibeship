/**
 * Мост между OpenAI клиента и binding-а на Workers AI.
 *
 * Целият инференс слой е написан върху `openai` SDK: стрийминг, tool calls и
 * структуриран изход се разчитат в OpenAI формат. Binding-ът `env.AI.run`
 * обаче не е HTTP и връща своя форма.
 *
 * Вместо да се дублира целият слой, тук се подменя само `fetch`-ът на клиента:
 * заявката се разпарсва, подава се на binding-а и отговорът се пре-облича в
 * OpenAI форма. Така моделите на Cloudflare минават без ключ и без AI Gateway,
 * а останалата част от кода не забелязва разлика.
 *
 * Виж и `src/lib/ai/cloudflare.ts` в radoslav1992/notebook — там същият binding
 * се ползва директно, което е и доказателството, че този път не иска ключ.
 */

/** Само това ни трябва от binding-а. */
export interface WorkersAiBinding {
	run(
		model: string,
		input: Record<string, unknown>,
		options?: Record<string, unknown>,
	): Promise<unknown>;
}

/** Заявката, която OpenAI SDK изпраща към /chat/completions. */
interface OpenAiChatRequest {
	model?: string;
	messages?: unknown[];
	max_completion_tokens?: number;
	max_tokens?: number;
	temperature?: number;
	tools?: unknown[];
	tool_choice?: unknown;
	stream?: boolean;
}

/** Формите, в които Workers AI връща текст. */
interface WorkersAiTextResult {
	response?: unknown;
	tool_calls?: unknown;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
	/** Някои модели вече връщат направо OpenAI форма. */
	choices?: unknown[];
}

/**
 * Превежда тялото на OpenAI заявка към входа на binding-а.
 *
 * `max_completion_tokens` е новото име в OpenAI SDK, а Workers AI приема
 * `max_tokens` — затова се преименува, вместо да се подаде и двете.
 */
export function toWorkersAiInput(body: OpenAiChatRequest): Record<string, unknown> {
	const input: Record<string, unknown> = {
		messages: body.messages ?? [],
	};

	const maxTokens = body.max_completion_tokens ?? body.max_tokens;
	if (typeof maxTokens === 'number') input.max_tokens = maxTokens;
	if (typeof body.temperature === 'number') input.temperature = body.temperature;

	// Инструментите се подават както са — Workers AI очаква същата OpenAI форма.
	if (Array.isArray(body.tools) && body.tools.length > 0) {
		input.tools = body.tools;
		if (body.tool_choice !== undefined) input.tool_choice = body.tool_choice;
	}

	if (body.stream) input.stream = true;
	return input;
}

/**
 * Пре-облича отговора на binding-а в OpenAI `chat.completion`.
 *
 * Ако моделът вече връща OpenAI форма (`choices`), тя се подава непокътната —
 * така новите модели, които са съвместими, минават без превод.
 */
export function toOpenAiCompletion(
	result: WorkersAiTextResult | string,
	model: string,
): Record<string, unknown> {
	const base = {
		id: `workers-ai-${crypto.randomUUID()}`,
		object: 'chat.completion',
		created: Math.floor(Date.now() / 1000),
		model,
	};

	if (typeof result === 'string') {
		return {
			...base,
			choices: [
				{
					index: 0,
					message: { role: 'assistant', content: result },
					finish_reason: 'stop',
				},
			],
		};
	}

	if (Array.isArray(result.choices)) {
		return { ...base, ...result };
	}

	const toolCalls = normalizeToolCalls(result.tool_calls);
	const content = typeof result.response === 'string' ? result.response : '';

	return {
		...base,
		choices: [
			{
				index: 0,
				message: {
					role: 'assistant',
					content,
					...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
				},
				finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
			},
		],
		...(result.usage ? { usage: result.usage } : {}),
	};
}

/**
 * Workers AI връща tool calls като `{ name, arguments }`, а OpenAI ги очаква
 * с `id`, `type` и сериализирани аргументи.
 */
function normalizeToolCalls(raw: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(raw)) return [];

	return raw.flatMap((entry, index) => {
		if (!entry || typeof entry !== 'object') return [];
		const call = entry as Record<string, unknown>;

		// Вече в OpenAI форма.
		if (call.function && typeof call.function === 'object') {
			return [
				{
					id: typeof call.id === 'string' ? call.id : `call_${index}`,
					type: 'function',
					function: call.function,
				},
			];
		}

		const name = call.name;
		if (typeof name !== 'string') return [];
		const args = call.arguments ?? call.parameters ?? {};

		return [
			{
				id: typeof call.id === 'string' ? call.id : `call_${index}`,
				type: 'function',
				function: {
					name,
					arguments: typeof args === 'string' ? args : JSON.stringify(args),
				},
			},
		];
	});
}

/** Един SSE ред в OpenAI форма за стрийминг. */
export function toOpenAiChunk(delta: string, model: string): string {
	const chunk = {
		id: `workers-ai-${model}`,
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
	};
	return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * Изважда текстовото парче от един ред на стрийма на Workers AI.
 * Връща `null`, когато редът не носи текст (коментар, `[DONE]`, шум).
 */
export function extractStreamDelta(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith('data:')) return null;

	const payload = trimmed.slice(5).trim();
	if (payload === '' || payload === '[DONE]') return null;

	try {
		const parsed = JSON.parse(payload) as { response?: unknown; choices?: unknown };
		// Съвместим модел — подаваме реда както е.
		if (Array.isArray(parsed.choices)) return null;
		return typeof parsed.response === 'string' ? parsed.response : null;
	} catch {
		return null;
	}
}

/**
 * Прави `fetch`, който вместо мрежова заявка вика binding-а.
 *
 * `modelOverride` идва от променливата `WORKERS_AI_MODEL` — така моделът се
 * сменя без промяна в кода и без нов deploy на каталога.
 */
export function createWorkersAiFetch(
	ai: WorkersAiBinding,
	modelOverride?: string,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
	// `input` (адресът) не се ползва — binding-ът не е HTTP и маршрутът е един.
	return async (_input, init) => {
		const raw = typeof init?.body === 'string' ? init.body : '{}';
		let body: OpenAiChatRequest;
		try {
			body = JSON.parse(raw) as OpenAiChatRequest;
		} catch {
			return jsonError('Неразпознато тяло на заявката към Workers AI', 400);
		}

		// Каталожният идентификатор е с префикс `workers-ai/`; binding-ът иска
		// само името на модела.
		const requested = (body.model ?? '').replace(/^workers-ai\//, '');
		const model = modelOverride && modelOverride.trim() !== '' ? modelOverride : requested;
		if (!model) {
			return jsonError('Липсва име на модел за Workers AI', 400);
		}

		const aiInput = toWorkersAiInput(body);

		try {
			const result = await ai.run(model, aiInput, {
				// Подава се сигналът за прекъсване, за да може потребителят да
				// спре генерирането както при останалите доставчици.
				...(init?.signal ? { signal: init.signal } : {}),
			});

			if (body.stream && result instanceof ReadableStream) {
				return new Response(toOpenAiStream(result, model), {
					status: 200,
					headers: {
						'Content-Type': 'text/event-stream',
						'Cache-Control': 'no-cache',
					},
				});
			}

			const completion = toOpenAiCompletion(result as WorkersAiTextResult | string, model);
			return new Response(JSON.stringify(completion), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return jsonError(`Workers AI отказа заявката: ${message}`, 502);
		}
	};
}

/** Превежда стрийма на Workers AI към OpenAI SSE. */
function toOpenAiStream(source: ReadableStream, model: string): ReadableStream {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = '';

	return source.pipeThrough(
		new TransformStream({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk as BufferSource, { stream: true });
				const lines = buffer.split('\n');
				// Последният ред може да е непълен — остава за следващия chunk.
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const delta = extractStreamDelta(line);
					if (delta !== null && delta !== '') {
						controller.enqueue(encoder.encode(toOpenAiChunk(delta, model)));
					}
				}
			},
			flush(controller) {
				const delta = extractStreamDelta(buffer);
				if (delta !== null && delta !== '') {
					controller.enqueue(encoder.encode(toOpenAiChunk(delta, model)));
				}
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			},
		}),
	);
}

function jsonError(message: string, status: number): Response {
	return new Response(JSON.stringify({ error: { message } }), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
