import Anthropic from '@anthropic-ai/sdk';
import { MODEL, AI_TEMPERATURE } from '../gameConfig';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

export async function callClaude(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const anthropic = getClient();

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: AI_TEMPERATURE,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage + '\n\n반드시 JSON 객체 하나만 출력하라. 코드펜스, 설명, 접두사 금지. { 로 시작하라.',
        },
      ],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';
    return text;
  } catch (err) {
    console.error('Claude API error:', err);
    throw err;
  }
}

export function parseAIJson<T>(raw: string): T {
  // Remove code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  // Ensure it starts with {
  const start = cleaned.indexOf('{');
  if (start > 0) cleaned = cleaned.slice(start);
  // Find the last }
  const end = cleaned.lastIndexOf('}');
  if (end >= 0) cleaned = cleaned.slice(0, end + 1);
  return JSON.parse(cleaned) as T;
}
