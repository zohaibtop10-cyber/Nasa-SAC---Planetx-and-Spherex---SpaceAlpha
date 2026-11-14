/**
 * Next.js App Router POST Route: /api/explore-object
 *
 * Accepts `{ query: string }`.
 * Determines if query is a URL or an object name, scrapes or searches Wikipedia/NASA API,
 * structures the data for a 3D workspace using Google Gemini (@google/generative-ai),
 * and returns the validated JSON payload.
 */

import { executeExploreObjectWorkflow } from '../../../api/exploreObjectWorkflow';

export async function POST(request: Request): Promise<Response> {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON request body. Expected { query: string }.' },
        { status: 400 }
      );
    }

    const query = body?.query;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return Response.json(
        { error: "Field 'query' is required (URL or object name)." },
        { status: 400 }
      );
    }

    const result = await executeExploreObjectWorkflow(query.trim());
    return Response.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    const isTimeout =
      error.name === 'AbortError' ||
      (error.message && error.message.toLowerCase().includes('timeout'));

    return Response.json(
      {
        error: error.message || 'Failed to explore celestial object.',
      },
      { status: isTimeout ? 504 : 400 }
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  const urlObj = new URL(request.url);
  const query = urlObj.searchParams.get('query');

  if (!query || !query.trim()) {
    return Response.json(
      { error: "Query parameter 'query' is required. Use POST with { query: string }." },
      { status: 400 }
    );
  }

  try {
    const result = await executeExploreObjectWorkflow(query.trim());
    return Response.json(result, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { error: error.message || 'Failed to explore celestial object.' },
      { status: 400 }
    );
  }
}
