import { getAiSettings } from '../ai/synthesizer/settings';

const IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

interface GeminiInlineData {
  mimeType?: string;
  mime_type?: string;
  data?: string;
}

interface GeminiPart {
  inlineData?: GeminiInlineData;
  inline_data?: GeminiInlineData;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: { message?: string };
}

function buildPassiveIconPrompt(cardName: string, description: string): string {
  return `1980s retro sci-fi pixel art icon, dark background, glowing neon, representing ${cardName}: ${description}. High contrast, hardware augment aesthetic, flat diorama perspective.`;
}

function extractImageDataUrl(response: GeminiGenerateContentResponse): string | null {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return null;

  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    if (!inline?.data) continue;
    const mime = inline.mimeType ?? inline.mime_type ?? 'image/png';
    if (inline.data.startsWith('data:')) return inline.data;
    return `data:${mime};base64,${inline.data}`;
  }

  return null;
}

export async function generatePassiveIcon(cardName: string, description: string): Promise<string> {
  const settings = getAiSettings();
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    throw new Error('No Gemini API key configured');
  }

  const baseUrl = settings.baseUrl.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/models/${IMAGE_MODEL}:generateContent`;
  const prompt = buildPassiveIconPrompt(cardName, description);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Image generation failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as GeminiGenerateContentResponse;
  if (json.error?.message) {
    throw new Error(json.error.message);
  }

  const dataUrl = extractImageDataUrl(json);
  if (!dataUrl) {
    throw new Error('Image generation response contained no inline image data');
  }

  return dataUrl;
}
