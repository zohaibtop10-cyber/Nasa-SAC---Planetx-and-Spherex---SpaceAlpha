/**
 * Next.js App Router Route Handler: /api/fetch-nasa-object
 *
 * Implements an on-demand multi-agent workflow using official Google Gemini API SDK:
 * 1. Sub-Agent 1 (Scraper): Accepts target NASA URL in POST body, fetches raw HTML,
 *    and extracts clean <article> text and candidate <img> URLs.
 * 2. Sub-Agent 2 (Extractor & 3D Compiler): Initializes @google/generative-ai SDK with
 *    process.env.GEMINI_API_KEY, utilizes 'gemini-1.5-flash' with responseMimeType: 'application/json',
 *    and strictly extracts { name, classification, summary, images, renderState }.
 * 3. Non-Negotiable Compliance: Enforces Rule 2 (tag: "Illustrative") on renderState.
 *
 * Handles timeouts, malformed requests, and scraping errors with graceful HTTP 400 responses.
 */

import { executeMultiAgentPipeline } from '../../../api/fetchNasaObjectWorkflow';

export async function GET(request: Request): Promise<Response> {
  try {
    const urlObj = new URL(request.url);
    const targetUrl = urlObj.searchParams.get('url');

    if (!targetUrl || !targetUrl.trim()) {
      return Response.json(
        { error: "Query parameter 'url' is required." },
        { status: 400 }
      );
    }

    const payload = await executeMultiAgentPipeline(targetUrl.trim());
    return Response.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        error: error.message || 'Failed to process NASA celestial object URL.',
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const targetUrl = body?.url;
    if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.trim()) {
      return Response.json(
        { error: "Body parameter 'url' is required and must be a valid URL string." },
        { status: 400 }
      );
    }

    const payload = await executeMultiAgentPipeline(targetUrl.trim());
    return Response.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        error: error.message || 'Failed to process NASA celestial object URL.',
      },
      { status: 400 }
    );
  }
}
