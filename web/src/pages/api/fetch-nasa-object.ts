/**
 * Next.js Pages Router Route Handler: /api/fetch-nasa-object
 *
 * Implements an on-demand multi-agent workflow:
 * 1. Agent 1 (Scraper): Fetches raw HTML and extracts <article> text & <img> URLs.
 * 2. Agent 2 (Extractor): Analyzes text with Gemini (or fallback) to extract metadata.
 * 3. Agent 3 (Procedural Compiler): Generates procedural 3D parameters (renderState).
 * 4. Consolidator: Merges into a structured bento-grid payload.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { executeMultiAgentPipeline } from '../../api/fetchNasaObjectWorkflow';

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
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Use GET or POST.' });
    return;
  }

  try {
    let targetUrl: string | undefined;

    if (req.method === 'GET') {
      const qUrl = req.query.url;
      targetUrl = Array.isArray(qUrl) ? qUrl[0] : qUrl;
    } else if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      targetUrl = body?.url;
    }

    if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.trim()) {
      res.status(400).json({ error: "Parameter 'url' is required." });
      return;
    }

    const payload = await executeMultiAgentPipeline(targetUrl.trim());
    res.status(200).json(payload);
  } catch (error: any) {
    res.status(400).json({
      error: error.message || 'Failed to process NASA celestial object URL.',
    });
  }
}
