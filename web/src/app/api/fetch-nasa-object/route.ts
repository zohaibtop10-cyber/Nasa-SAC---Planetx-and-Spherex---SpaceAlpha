/**
 * Next.js App Router Route Handler: /api/fetch-nasa-object
 *
 * Implements an on-demand multi-agent workflow:
 * 1. Agent 1 (Scraper): Fetches raw HTML and extracts <article> text & <img> URLs.
 * 2. Agent 2 (Extractor): Analyzes text with Gemini (or fallback) to extract metadata.
 * 3. Agent 3 (Procedural Compiler): Generates procedural 3D parameters (renderState).
 * 4. Consolidator: Merges into a structured bento-grid payload.
 *
 * Handles timeouts and scraping errors with an HTTP 400 response.
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
