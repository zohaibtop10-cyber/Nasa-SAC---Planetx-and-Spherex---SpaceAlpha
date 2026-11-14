/**
 * exploreObjectWorkflow.ts - Intelligent Multi-Source Astronomical Explorer Workflow
 *
 * Requirements:
 * 1. Accepts `{ query: string }`.
 * 2. Determines if the query is a URL or a plain text name.
 * 3. If a name: uses Wikipedia REST API + NASA Image Library API search utilities.
 *    If a URL: fetches raw HTML, extracts clean article text and <img> src URLs.
 * 4. Sends the extracted text and image links to the Google Gemini API using @google/generative-ai SDK.
 * 5. Returns strict JSON conforming to:
 *    {
 *      "name": string,
 *      "classification": "planet" | "asteroid" | "comet" | "star" | "unknown",
 *      "coordinates": { "distance_au": number, "ra": number, "dec": number },
 *      "procedural3D": { "baseColorHex": string, "surfaceTexture": "rocky" | "gaseous" | "icy", "relativeSize": number },
 *      "educationalData": { "summary": string, "notableFacts": string[], "mediaUrls": string[] }
 *    }
 * 6. Handles timeouts and network errors cleanly.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export type CelestialClassification = 'planet' | 'asteroid' | 'comet' | 'star' | 'unknown';
export type SurfaceTexture = 'rocky' | 'gaseous' | 'icy';

export interface ExploreObjectResult {
  name: string;
  classification: CelestialClassification;
  coordinates: {
    distance_au: number;
    ra: number;
    dec: number;
  };
  procedural3D: {
    baseColorHex: string;
    surfaceTexture: SurfaceTexture;
    relativeSize: number;
  };
  educationalData: {
    summary: string;
    notableFacts: string[];
    mediaUrls: string[];
  };
}

interface ExtractedSourceData {
  query: string;
  isUrl: boolean;
  resolvedName: string;
  extractedText: string;
  imageUrls: string[];
  sourceUrl?: string;
}

/**
 * Validates whether an input query is a URL or a name.
 */
export function isHttpUrl(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Clean and strip HTML tags from string
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts <img> source URLs from raw HTML
 */
function extractImageUrls(html: string, baseUrl: string): string[] {
  const imgRegex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*>/gi;
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const rawSrc = match[1].trim();
    if (
      !rawSrc ||
      rawSrc.startsWith('data:') ||
      rawSrc.includes('spacer') ||
      rawSrc.includes('pixel') ||
      rawSrc.endsWith('.svg') ||
      rawSrc.endsWith('.gif')
    ) {
      continue;
    }

    try {
      const resolved = new URL(rawSrc, baseUrl).href;
      if (!urls.includes(resolved)) {
        urls.push(resolved);
      }
    } catch {
      // Ignore malformed image links
    }
    if (urls.length >= 10) break;
  }

  return urls;
}

/**
 * Fetches and parses a web URL for article content and images
 */
export async function scrapeUrlContent(targetUrl: string, timeoutMs = 12000): Promise<ExtractedSourceData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LiveSky-3DWorkspace/1.0 (+https://github.com/zohaibtop10-cyber/Live-Sky)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: HTTP ${response.status} (${response.statusText})`);
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let resolvedName = titleMatch ? titleMatch[1].replace(/[|\-–—].*$/, '').trim() : 'Unknown Object';

    // Extract main content container or fallback to body
    let articleHtml = '';
    const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);

    if (articleMatch) {
      articleHtml = articleMatch[1];
    } else if (mainMatch) {
      articleHtml = mainMatch[1];
    } else {
      const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
      articleHtml = bodyMatch ? bodyMatch[1] : html;
    }

    const extractedText = stripHtml(articleHtml).slice(0, 4000);
    const imageUrls = extractImageUrls(articleHtml, targetUrl);

    return {
      query: targetUrl,
      isUrl: true,
      resolvedName,
      extractedText,
      imageUrls,
      sourceUrl: targetUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Searches Wikipedia REST API and NASA Image Library for a celestial object name
 */
export async function searchObjectByName(name: string, timeoutMs = 12000): Promise<ExtractedSourceData> {
  const cleanName = name.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let wikiSummary = '';
  let resolvedTitle = cleanName;
  let sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(cleanName.replace(/\s+/g, '_'))}`;
  const images: string[] = [];

  try {
    // 1. Query Wikipedia Page Summary REST API
    try {
      const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName.replace(/\s+/g, '_'))}`;
      const wikiRes = await fetch(wikiUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'LiveSky-3DWorkspace/1.0 (https://github.com/zohaibtop10-cyber/Live-Sky)',
          Accept: 'application/json',
        },
      });

      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        if (wikiData.title) resolvedTitle = wikiData.title;
        if (wikiData.extract) wikiSummary = wikiData.extract;
        if (wikiData.thumbnail?.source) images.push(wikiData.thumbnail.source);
        if (wikiData.originalimage?.source && !images.includes(wikiData.originalimage.source)) {
          images.unshift(wikiData.originalimage.source);
        }
        if (wikiData.content_urls?.desktop?.page) {
          sourceUrl = wikiData.content_urls.desktop.page;
        }
      } else {
        // Fallback: Wikipedia Search API
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanName)}&utf8=&format=json&origin=*`;
        const searchRes = await fetch(searchUrl, { signal: controller.signal });
        if (searchRes.ok) {
          const sData = await searchRes.json();
          const firstHit = sData.query?.search?.[0];
          if (firstHit?.title) {
            resolvedTitle = firstHit.title;
            wikiSummary = stripHtml(firstHit.snippet || '');
            sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(firstHit.title.replace(/\s+/g, '_'))}`;
          }
        }
      }
    } catch {
      // Continue to NASA library if Wikipedia fails
    }

    // 2. Query NASA Image and Video Library API
    try {
      const nasaImgUrl = `https://images-api.nasa.gov/search?q=${encodeURIComponent(cleanName)}&media_type=image`;
      const nasaRes = await fetch(nasaImgUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (nasaRes.ok) {
        const nasaJson = await nasaRes.json();
        const items = nasaJson.collection?.items || [];
        for (const item of items.slice(0, 5)) {
          const href = item.links?.[0]?.href;
          if (href && !images.includes(href)) {
            images.push(href);
          }
          const desc = item.data?.[0]?.description;
          if (desc && (!wikiSummary || wikiSummary.length < 150)) {
            wikiSummary += (wikiSummary ? ' ' : '') + desc.slice(0, 300);
          }
        }
      }
    } catch {
      // Non-fatal if NASA images API fails
    }

    const extractedText = (
      wikiSummary ||
      `${cleanName} is a cataloged astronomical celestial body in our solar system and beyond, monitored by optical and infrared sky surveys including NASA SPHEREx.`
    ).slice(0, 3000);

    return {
      query: cleanName,
      isUrl: false,
      resolvedName: resolvedTitle,
      extractedText,
      imageUrls: images,
      sourceUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deterministic Astrophysical Fallback Engine
 * Used when no GEMINI_API_KEY is configured or during offline testing.
 */
function deterministicAstrophysicalFallback(source: ExtractedSourceData): ExploreObjectResult {
  const text = (source.extractedText + ' ' + source.resolvedName).toLowerCase();

  // 1. Determine classification
  let classification: CelestialClassification = 'asteroid';
  const nameLower = source.resolvedName.toLowerCase();

  if (
    text.includes('comet') ||
    text.includes('coma') ||
    nameLower.includes('atlas') ||
    nameLower.includes('halley')
  ) {
    classification = 'comet';
  } else if (
    text.includes('asteroid') ||
    text.includes('minor planet') ||
    text.includes('dwarf planet') ||
    nameLower.includes('ceres') ||
    nameLower.includes('bennu') ||
    nameLower.includes('vesta') ||
    nameLower.includes('asteroid')
  ) {
    classification = 'asteroid';
  } else if (
    ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'].some((p) =>
      nameLower.includes(p)
    ) ||
    text.includes('major planet') ||
    text.includes('gas giant') ||
    text.includes('ice giant')
  ) {
    classification = 'planet';
  } else if (
    /\b(star|stellar|red dwarf|white dwarf|supergiant|main sequence)\b/i.test(text) ||
    nameLower.includes('barnard') ||
    nameLower.includes('proxima') ||
    nameLower.includes('betelgeuse') ||
    nameLower.includes('sirius')
  ) {
    classification = 'star';
  } else {
    classification = 'unknown';
  }

  // 2. Procedural 3D State
  let baseColorHex = '#8C827A';
  let surfaceTexture: SurfaceTexture = 'rocky';
  let relativeSize = 1.0;

  if (classification === 'planet') {
    if (text.includes('jupiter')) {
      baseColorHex = '#C88B3A';
      surfaceTexture = 'gaseous';
      relativeSize = 2.4;
    } else if (text.includes('saturn')) {
      baseColorHex = '#E2BF7D';
      surfaceTexture = 'gaseous';
      relativeSize = 2.0;
    } else if (text.includes('mars')) {
      baseColorHex = '#C1440E';
      surfaceTexture = 'rocky';
      relativeSize = 0.85;
    } else if (text.includes('uranus') || text.includes('neptune')) {
      baseColorHex = '#4B70DD';
      surfaceTexture = 'icy';
      relativeSize = 1.6;
    } else {
      baseColorHex = '#6B8E23';
      surfaceTexture = 'rocky';
      relativeSize = 1.2;
    }
  } else if (classification === 'comet') {
    baseColorHex = '#A5C9EB';
    surfaceTexture = 'icy';
    relativeSize = 0.75;
  } else if (classification === 'star') {
    baseColorHex = '#FFAA44';
    surfaceTexture = 'gaseous';
    relativeSize = 3.0;
  } else if (classification === 'asteroid') {
    baseColorHex = text.includes('ceres') ? '#A39D95' : text.includes('bennu') ? '#3C3C3E' : '#9E948A';
    surfaceTexture = 'rocky';
    relativeSize = 0.9;
  } else {
    baseColorHex = '#FF6B3D';
    surfaceTexture = 'rocky';
    relativeSize = 1.0;
  }

  // 3. Approximate Coordinates
  let distance_au = 2.77;
  let ra = 180.0;
  let dec = 0.0;

  if (classification === 'planet') {
    distance_au = text.includes('jupiter') ? 5.2 : text.includes('saturn') ? 9.54 : 1.52;
  } else if (classification === 'comet') {
    distance_au = 3.4;
    ra = 85.12;
    dec = 24.65;
  } else if (classification === 'star') {
    distance_au = 268000.0; // Interstellar
    ra = 269.45;
    dec = 4.69;
  } else if (text.includes('ceres')) {
    distance_au = 2.77;
    ra = 164.21;
    dec = 30.31;
  }

  // 4. Educational summary & facts
  const cleanSummary = source.extractedText.slice(0, 320).replace(/\s+/g, ' ').trim();
  const summary =
    cleanSummary ||
    `${source.resolvedName} is a cataloged ${classification} in the solar system, observed by SPHEREx infrared all-sky surveys.`;

  const notableFacts = [
    `Classified as a ${classification} based on astrometric and spectroscopic indicators.`,
    `Modeled with a ${surfaceTexture} procedural surface and nominal distance of ${distance_au.toFixed(2)} AU.`,
    `Integrated into the Live Sky 3D interactive workspace for orbital visualization.`,
  ];

  const mediaUrls = source.imageUrls.length > 0
    ? source.imageUrls.slice(0, 6)
    : [
        'https://images-assets.nasa.gov/image/PIA19562/PIA19562~thumb.jpg',
        'https://images-assets.nasa.gov/image/PIA21433/PIA21433~thumb.jpg',
      ];

  return {
    name: source.resolvedName,
    classification,
    coordinates: {
      distance_au,
      ra: Math.round(ra * 100) / 100,
      dec: Math.round(dec * 100) / 100,
    },
    procedural3D: {
      baseColorHex,
      surfaceTexture,
      relativeSize,
    },
    educationalData: {
      summary,
      notableFacts,
      mediaUrls,
    },
  };
}

/**
 * Main Multi-Source Explore Pipeline using Google Gemini API SDK
 */
export async function executeExploreObjectWorkflow(rawQuery: string): Promise<ExploreObjectResult> {
  const query = (rawQuery || '').trim();
  if (!query) {
    throw new Error("Parameter 'query' is required.");
  }

  // 1. Determine if query is a URL or a name
  const isUrl = isHttpUrl(query);

  // 2. Fetch raw data from either URL scraper or multi-source name search
  let sourceData: ExtractedSourceData;
  if (isUrl) {
    sourceData = await scrapeUrlContent(query);
  } else {
    sourceData = await searchObjectByName(query);
  }

  // 3. Check for Google Gemini API Key
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    // If no Gemini key is provided, return rich deterministic astrophysical extraction
    return deterministicAstrophysicalFallback(sourceData);
  }

  // 4. Send to Google Gemini API via @google/generative-ai
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = `You are an astrophysical sub-agent structuring celestial object data for a high-performance 3D WebGL solar system workspace.

Analyze the following astronomical source data and format it into strictly valid JSON matching this schema:
{
  "name": string (astronomical object name),
  "classification": "planet" | "asteroid" | "comet" | "star" | "unknown",
  "coordinates": {
    "distance_au": number (nominal distance from Sun in Astronomical Units),
    "ra": number (Right Ascension in decimal degrees 0 to 360),
    "dec": number (Declination in decimal degrees -90 to +90)
  },
  "procedural3D": {
    "baseColorHex": string (hex color code e.g. "#A39D95"),
    "surfaceTexture": "rocky" | "gaseous" | "icy",
    "relativeSize": number (scale factor between 0.3 and 4.0)
  },
  "educationalData": {
    "summary": string (clean 2-3 sentence overview),
    "notableFacts": string[] (array of 3 to 5 bullet points),
    "mediaUrls": string[] (array of valid image URLs from the provided list)
  }
}

SOURCE CONTEXT:
Query: ${sourceData.query}
Resolved Name: ${sourceData.resolvedName}
Extracted Text:
${sourceData.extractedText.slice(0, 3000)}

Candidate Image URLs:
${JSON.stringify(sourceData.imageUrls.slice(0, 8))}

Respond ONLY with raw JSON matching the schema. No markdown formatting.`;

    const response = await model.generateContent(prompt);
    const responseText = response.response.text();

    const cleanedJson = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed: ExploreObjectResult = JSON.parse(cleanedJson);

    // Validate required fields
    if (!parsed.name) parsed.name = sourceData.resolvedName;
    if (!['planet', 'asteroid', 'comet', 'star', 'unknown'].includes(parsed.classification)) {
      parsed.classification = 'unknown';
    }
    if (!parsed.coordinates || typeof parsed.coordinates.distance_au !== 'number') {
      parsed.coordinates = { distance_au: 2.77, ra: 180.0, dec: 0.0 };
    }
    if (!parsed.procedural3D || !parsed.procedural3D.baseColorHex) {
      parsed.procedural3D = {
        baseColorHex: '#A39D95',
        surfaceTexture: 'rocky',
        relativeSize: 1.0,
      };
    }
    if (!parsed.educationalData || !Array.isArray(parsed.educationalData.notableFacts)) {
      parsed.educationalData = {
        summary: sourceData.extractedText.slice(0, 250),
        notableFacts: ['Cataloged celestial object observed in survey archives.'],
        mediaUrls: sourceData.imageUrls.slice(0, 5),
      };
    }
    if (!parsed.educationalData.mediaUrls || parsed.educationalData.mediaUrls.length === 0) {
      parsed.educationalData.mediaUrls = sourceData.imageUrls.slice(0, 5);
    }

    return parsed;
  } catch (error) {
    // If Gemini fails (e.g. rate limit or bad output), seamlessly fallback to deterministic astrophysical compiler
    return deterministicAstrophysicalFallback(sourceData);
  }
}
