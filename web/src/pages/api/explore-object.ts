/**
 * Next.js Pages Router API Route: /api/explore-object
 *
 * Accepts `{ query: string }`.
 * Determines if query is a URL or an object name, scrapes or searches Wikipedia/NASA API,
 * structures the data for a 3D workspace using Google Gemini (@google/generative-ai),
 * and returns the validated JSON payload.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { executeExploreObjectWorkflow } from '../../api/exploreObjectWorkflow';

export interface NextApiRequestLike extends IncomingMessage {
  query: Partial<{ [key: string]: string | string[] }>;
  body: any;
  method?: string;
}

export interface NextApiResponseLike extends ServerResponse {
  status: (code: number) => NextApiResponseLike;
  json: (data: any) => void;
}

export default async function handler(
  req: NextApiRequestLike,
  res: NextApiResponseLike
): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed. Use POST with { query: string }.' });
    return;
  }

  try {
    let query: string | undefined;

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      query = body?.query;
    } else if (req.method === 'GET') {
      const q = req.query.query;
      query = Array.isArray(q) ? q[0] : q;
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: "Field 'query' is required (URL or object name)." });
      return;
    }

    const result = await executeExploreObjectWorkflow(query.trim());
    res.status(200).json(result);
  } catch (error: any) {
    const isTimeout =
      error.name === 'AbortError' ||
      (error.message && error.message.toLowerCase().includes('timeout'));

    res.status(isTimeout ? 504 : 400).json({
      error: error.message || 'Failed to explore celestial object.',
    });
  }
}
