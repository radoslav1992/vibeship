import { describe, it, expect, vi } from 'vitest';
import {
	createWorkersAiFetch,
	extractStreamDelta,
	toOpenAiChunk,
	toOpenAiCompletion,
	toWorkersAiInput,
	type WorkersAiBinding,
} from './workers-ai-fetch';

describe('toWorkersAiInput', () => {
	it('преименува max_completion_tokens на max_tokens', () => {
		const input = toWorkersAiInput({ messages: [], max_completion_tokens: 4096 });
		expect(input.max_tokens).toBe(4096);
		expect(input).not.toHaveProperty('max_completion_tokens');
	});

	it('приема и max_tokens, когато е подадено така', () => {
		expect(toWorkersAiInput({ max_tokens: 100 }).max_tokens).toBe(100);
	});

	it('подава инструментите непокътнати', () => {
		const tools = [{ type: 'function', function: { name: 'read_file' } }];
		const input = toWorkersAiInput({ tools, tool_choice: 'auto' });
		expect(input.tools).toEqual(tools);
		expect(input.tool_choice).toBe('auto');
	});

	it('не слага празен списък с инструменти', () => {
		expect(toWorkersAiInput({ tools: [] })).not.toHaveProperty('tools');
	});

	it('вдига stream само когато е поискан', () => {
		expect(toWorkersAiInput({ stream: true }).stream).toBe(true);
		expect(toWorkersAiInput({})).not.toHaveProperty('stream');
	});
});

describe('toOpenAiCompletion', () => {
	it('обвива обикновен текстов отговор', () => {
		const out = toOpenAiCompletion({ response: 'Здравей' }, '@cf/openai/gpt-oss-120b') as {
			choices: Array<{ message: { content: string }; finish_reason: string }>;
		};
		expect(out.choices[0].message.content).toBe('Здравей');
		expect(out.choices[0].finish_reason).toBe('stop');
	});

	it('приема и чист низ', () => {
		const out = toOpenAiCompletion('готово', 'm') as {
			choices: Array<{ message: { content: string } }>;
		};
		expect(out.choices[0].message.content).toBe('готово');
	});

	it('превежда tool calls до OpenAI форма със сериализирани аргументи', () => {
		const out = toOpenAiCompletion(
			{ response: '', tool_calls: [{ name: 'read_file', arguments: { path: 'a.ts' } }] },
			'm',
		) as {
			choices: Array<{
				message: { tool_calls: Array<{ type: string; function: { name: string; arguments: string } }> };
				finish_reason: string;
			}>;
		};
		const call = out.choices[0].message.tool_calls[0];
		expect(call.type).toBe('function');
		expect(call.function.name).toBe('read_file');
		expect(JSON.parse(call.function.arguments)).toEqual({ path: 'a.ts' });
		expect(out.choices[0].finish_reason).toBe('tool_calls');
	});

	it('не пипа tool calls, които вече са в OpenAI форма', () => {
		const out = toOpenAiCompletion(
			{
				response: '',
				tool_calls: [
					{ id: 'call_x', function: { name: 'deploy', arguments: '{}' } },
				],
			},
			'm',
		) as { choices: Array<{ message: { tool_calls: Array<{ id: string }> } }> };
		expect(out.choices[0].message.tool_calls[0].id).toBe('call_x');
	});

	it('пропуска отговор, който вече е в OpenAI форма', () => {
		const out = toOpenAiCompletion(
			{ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }] },
			'm',
		) as { choices: unknown[]; object: string };
		expect(out.choices).toHaveLength(1);
		expect(out.object).toBe('chat.completion');
	});

	it('пренася употребата на токени, когато я има', () => {
		const out = toOpenAiCompletion(
			{ response: 'x', usage: { prompt_tokens: 10, completion_tokens: 2 } },
			'm',
		) as { usage?: { prompt_tokens: number } };
		expect(out.usage?.prompt_tokens).toBe(10);
	});
});

describe('extractStreamDelta', () => {
	it('вади текста от валиден ред', () => {
		expect(extractStreamDelta('data: {"response":"аб"}')).toBe('аб');
	});

	it('пренебрегва [DONE], празни и нередови редове', () => {
		expect(extractStreamDelta('data: [DONE]')).toBeNull();
		expect(extractStreamDelta('data:')).toBeNull();
		expect(extractStreamDelta(': коментар')).toBeNull();
		expect(extractStreamDelta('data: {счупен')).toBeNull();
	});
});

describe('toOpenAiChunk', () => {
	it('прави валиден SSE ред с delta', () => {
		const line = toOpenAiChunk('здр', 'm');
		expect(line.startsWith('data: ')).toBe(true);
		expect(line.endsWith('\n\n')).toBe(true);
		const parsed = JSON.parse(line.slice(6)) as {
			object: string;
			choices: Array<{ delta: { content: string } }>;
		};
		expect(parsed.object).toBe('chat.completion.chunk');
		expect(parsed.choices[0].delta.content).toBe('здр');
	});
});

describe('createWorkersAiFetch', () => {
	const binding = (result: unknown): WorkersAiBinding => ({
		run: vi.fn().mockResolvedValue(result),
	});

	it('маха префикса workers-ai/ от името на модела', async () => {
		const ai = binding({ response: 'ok' });
		const doFetch = createWorkersAiFetch(ai);
		await doFetch('https://ignored/chat/completions', {
			body: JSON.stringify({ model: 'workers-ai/@cf/openai/gpt-oss-120b', messages: [] }),
		});
		expect(ai.run).toHaveBeenCalledWith('@cf/openai/gpt-oss-120b', expect.anything(), expect.anything());
	});

	it('променливата за модел бие каталожното име', async () => {
		const ai = binding({ response: 'ok' });
		const doFetch = createWorkersAiFetch(ai, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
		await doFetch('https://ignored', {
			body: JSON.stringify({ model: 'workers-ai/@cf/openai/gpt-oss-120b', messages: [] }),
		});
		expect(ai.run).toHaveBeenCalledWith(
			'@cf/meta/llama-3.3-70b-instruct-fp8-fast',
			expect.anything(),
			expect.anything(),
		);
	});

	it('връща OpenAI отговор, който SDK-то може да разчете', async () => {
		const doFetch = createWorkersAiFetch(binding({ response: 'Здравей' }));
		const res = await doFetch('https://ignored', {
			body: JSON.stringify({ model: 'workers-ai/m', messages: [] }),
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
		expect(json.choices[0].message.content).toBe('Здравей');
	});

	it('връща 400 при липсващо име на модел', async () => {
		const res = await createWorkersAiFetch(binding({}))('https://ignored', {
			body: JSON.stringify({ messages: [] }),
		});
		expect(res.status).toBe(400);
	});

	it('превръща отказ на binding-а в 502 с обяснение', async () => {
		const ai: WorkersAiBinding = {
			run: vi.fn().mockRejectedValue(new Error('7003: no such model')),
		};
		const res = await createWorkersAiFetch(ai)('https://ignored', {
			body: JSON.stringify({ model: 'workers-ai/m', messages: [] }),
		});
		expect(res.status).toBe(502);
		const json = (await res.json()) as { error: { message: string } };
		expect(json.error.message).toContain('7003');
	});

	it('превежда стрийма на Workers AI към OpenAI SSE', async () => {
		const encoder = new TextEncoder();
		const source = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"response":"здр"}\n'));
				controller.enqueue(encoder.encode('data: {"response":"авей"}\n'));
				controller.enqueue(encoder.encode('data: [DONE]\n'));
				controller.close();
			},
		});
		const res = await createWorkersAiFetch(binding(source))('https://ignored', {
			body: JSON.stringify({ model: 'workers-ai/m', messages: [], stream: true }),
		});

		expect(res.headers.get('Content-Type')).toBe('text/event-stream');
		const text = await res.text();
		const deltas = text
			.split('\n\n')
			.filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
			.map((line) => JSON.parse(line.slice(6)) as { choices: Array<{ delta: { content: string } }> })
			.map((chunk) => chunk.choices[0].delta.content);

		expect(deltas.join('')).toBe('здравей');
		expect(text.endsWith('data: [DONE]\n\n')).toBe(true);
	});
});
