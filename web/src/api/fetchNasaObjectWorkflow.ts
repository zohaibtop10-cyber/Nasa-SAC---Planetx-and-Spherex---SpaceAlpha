/**
 * fetchNasaObjectWorkflow.ts
 * Multi-Agent Workflow to parse a NASA URL and return structured 3D parameters and bento-grid data.
 *
 * Agents:
 * - Agent 1 (Scraper): Fetches raw HTML from target NASA URL, extracts <article> text and <img> URLs.
 * - Agent 2 (Extractor): Uses Google Gemini API (with deterministic fallback) to extract { name, classification, summary, images }.
 * - Agent 3 (Procedural Compiler): Uses Google Gemini API (with deterministic fallback) to compile { renderState: { baseColor, scale, textureType, hasRings } }.
 * - Consolidator: Merges outputs and returns the complete JSON payload with Rule 2 "Illustrative" tagging.
 */

export type ObjectClassification = 'planet' | 'asteroid' | 'comet' | 'star';
export type TextureType = 'rocky' | 'gaseous' | 'icy';

export interface ScrapedData {
  url: string;
  title: string;
  articleText: string;
  images: string[];
}

export interface ExtractedObject {
  name: string;
  classification: ObjectClassification;
  summary: string;
  images: string[];
}

export interface RenderState {
  baseColor: string;
  scale: number;
  textureType: TextureType;
  hasRings: boolean;
  tag?: string;
}

export interface NasaObjectPayload {
  name: string;
  classification: ObjectClassification;
  summary: string;
  images: string[];
  renderState: RenderState;
}

// ---------------------------------------------------------------------------
// Agent 1: Scraper
// ---------------------------------------------------------------------------

export async function scrapeNasaUrl(rawUrl: string, timeoutMs = 12000): Promise<ScrapedData> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error("Missing or invalid 'url' parameter.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error(`Invalid URL format: '${rawUrl}'.`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol '${parsedUrl.protocol}'. Only HTTP/HTTPS is allowed.`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let html: string;
  try {
    const res = await fetch(parsedUrl.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveSkyBot/1.0 (NASA Space Apps Challenge)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch URL. HTTP status ${res.status}: ${res.statusText}`);
    }

    html = await res.text();
  } catch (err: any) {
    if (err.name === 'AbortError' || err.code === 20) {
      throw new Error(`Request timed out after ${timeoutMs}ms while fetching '${rawUrl}'.`);
    }
    throw new Error(`Failed to scrape target URL: ${err.message || String(err)}`);
  } finally {
    clearTimeout(timeoutId);
  }

  // 1. Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? cleanText(titleMatch[1]).replace(/\s*\|\s*NASA.*$/i, '').trim() : '';

  // 2. Extract main article text
  let rawArticle = '';
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    rawArticle = articleMatch[1];
  } else {
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      rawArticle = mainMatch[1];
    } else {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      rawArticle = bodyMatch ? bodyMatch[1] : html;
    }
  }

  // Clean scripts, styles, nav, header, footer
  let cleanHtml = rawArticle
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');

  const articleText = cleanText(cleanHtml);

  // 3. Extract <img> source URLs
  const imgRegex = /<img\b[^>]*?\b(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  const rawImageUrls: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = imgRegex.exec(rawArticle)) !== null) {
    const src = m[1]?.trim();
    if (src && !src.startsWith('data:') && !src.includes('1x1') && !src.includes('blank.gif')) {
      try {
        const resolved = new URL(src, parsedUrl.href).href;
        // Keep valid image extensions or NASA asset paths
        if (/\.(jpe?g|png|webp|tiff?|gif)(\?.*)?$/i.test(resolved) || resolved.includes('/images/')) {
          if (!rawImageUrls.includes(resolved)) {
            rawImageUrls.push(resolved);
          }
        }
      } catch {
        // Skip malformed individual image URLs
      }
    }
  }

  // If article has very few images, search full HTML
  if (rawImageUrls.length === 0) {
    while ((m = imgRegex.exec(html)) !== null) {
      const src = m[1]?.trim();
      if (src && !src.startsWith('data:') && !src.includes('logo') && !src.includes('icon')) {
        try {
          const resolved = new URL(src, parsedUrl.href).href;
          if (/\.(jpe?g|png|webp|tiff?)(\?.*)?$/i.test(resolved)) {
            if (!rawImageUrls.includes(resolved)) {
              rawImageUrls.push(resolved);
            }
          }
        } catch {}
      }
    }
  }

  return {
    url: parsedUrl.href,
    title,
    articleText: articleText.slice(0, 8000), // Cap context to avoid token overflow
    images: rawImageUrls.slice(0, 10),
  };
}

function cleanText(raw: string): string {
  return raw
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Agent 2: Extractor (Google Gemini API with Heuristic Fallback)
// ---------------------------------------------------------------------------

export async function extractObjectDetails(
  scraped: ScrapedData,
  apiKey?: string
): Promise<ExtractedObject> {
  const geminiKey = apiKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const prompt = `You are Agent 2 (Extractor) in an astronomical intelligence pipeline.
Analyze the following NASA article text and candidate image URLs.
Extract and return strictly formatted JSON with no markdown wrapping:
{
  "name": string (the primary name or designation of the celestial object, e.g. "Europa", "1 Ceres", "Bennu"),
  "classification": "planet" | "asteroid" | "comet" | "star",
  "summary": string (a concise 1-2 sentence overview of its key physical or scientific characteristics),
  "images": string[] (up to 4 most relevant image URLs from the candidate list)
}

Title: ${scraped.title}
Article Text:
${scraped.articleText.slice(0, 4000)}

Candidate Images:
${JSON.stringify(scraped.images)}`;

      const res = await callGemini(geminiKey, prompt);
      const parsed = parseJsonFromLlm(res);
      if (parsed && parsed.name && parsed.classification) {
        const validClassification: ObjectClassification = ['planet', 'asteroid', 'comet', 'star'].includes(
          parsed.classification
        )
          ? parsed.classification
          : 'asteroid';

        return {
          name: String(parsed.name).trim(),
          classification: validClassification,
          summary: String(parsed.summary || `${parsed.name} is an astronomical object observed by NASA missions.`).trim(),
          images: Array.isArray(parsed.images) && parsed.images.length > 0 ? parsed.images : scraped.images.slice(0, 4),
        };
      }
    } catch (exc) {
      console.warn('[Agent 2: Extractor] Gemini API call failed or timed out. Falling back to heuristic extractor:', exc);
    }
  }

  // Deterministic Fallback Extractor
  return fallbackExtractor(scraped);
}

function fallbackExtractor(scraped: ScrapedData): ExtractedObject {
  // Name resolution
  let name = scraped.title || 'NASA Celestial Object';
  const nameMatch = scraped.title.match(/(?:about|overview|mission to|exploring|target)?\s*([A-Z0-9\s\-_–—]+)/i);
  if (nameMatch && nameMatch[1].trim().length > 2) {
    name = nameMatch[1].trim();
  }

  // Classification resolution (Title/URL prioritized over body mentions)
  const titleLower = scraped.title.toLowerCase();
  const urlPath = scraped.url.toLowerCase();
  const bodyLower = scraped.articleText.toLowerCase();

  let classification: ObjectClassification = 'asteroid';

  if (
    urlPath.includes('/asteroids/') ||
    titleLower.includes('asteroid') ||
    /\b(asteroid|meteorite|ceres|bennu|ryugu|psyche|didymos)\b/i.test(titleLower)
  ) {
    classification = 'asteroid';
  } else if (
    urlPath.includes('/comets/') ||
    titleLower.includes('comet') ||
    /\b(comet|coma|perihelion)\b/i.test(titleLower)
  ) {
    classification = 'comet';
  } else if (
    urlPath.includes('/planets/') ||
    titleLower.includes('planet') ||
    /\b(mercury|venus|earth|mars|jupiter|saturn|uranus|neptune)\b/i.test(titleLower)
  ) {
    classification = 'planet';
  } else if (
    urlPath.includes('/stars/') ||
    titleLower.includes('star') ||
    /\b(star|sun|pulsar|supernova)\b/i.test(titleLower)
  ) {
    classification = 'star';
  } else {
    // Secondary check: Body keyword counts
    const cometCount = (bodyLower.match(/\b(comet|comets|coma|perihelion)\b/g) || []).length;
    const planetCount = (bodyLower.match(/\b(planet|planets|gas giant|terrestrial planet)\b/g) || []).length;
    const asteroidCount = (bodyLower.match(/\b(asteroid|asteroids|meteoroid|meteorite)\b/g) || []).length;
    const starCount = (bodyLower.match(/\b(star|stars|supernova|white dwarf|red dwarf)\b/g) || []).length;

    const maxCount = Math.max(cometCount, planetCount, asteroidCount, starCount);
    if (maxCount > 0) {
      if (planetCount === maxCount) classification = 'planet';
      else if (asteroidCount === maxCount) classification = 'asteroid';
      else if (cometCount === maxCount) classification = 'comet';
      else classification = 'star';
    } else {
      classification = 'asteroid';
    }
  }

  // Summary generation from first 2 sentences
  const sentences = scraped.articleText
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 25 && !s.toLowerCase().includes('skip to') && !s.toLowerCase().includes('menu'));
  const summary =
    sentences.slice(0, 2).join(' ') ||
    `${name} is a celestial ${classification} documented in NASA planetary exploration archives.`;

  return {
    name,
    classification,
    summary,
    images: scraped.images.slice(0, 4),
  };
}

// ---------------------------------------------------------------------------
// Agent 3: Procedural Compiler (Google Gemini API with Heuristic Fallback)
// ---------------------------------------------------------------------------

export async function compileProceduralRenderState(
  extracted: ExtractedObject,
  apiKey?: string
): Promise<RenderState> {
  const geminiKey = apiKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const prompt = `You are Agent 3 (Procedural Compiler) in a 3D WebGL engine pipeline.
Given this celestial object:
Name: "${extracted.name}"
Classification: "${extracted.classification}"
Summary: "${extracted.summary}"

Compile procedural 3D parameters to render this object. Return strictly JSON with no markdown wrapping:
{
  "renderState": {
    "baseColor": string (hex color code representing realistic surface albedo e.g. "#C4A482" for rocky asteroid, "#D97706" for Jupiter, "#38BDF8" for ice, "#FFAA00" for star),
    "scale": number (relative positive scale float, e.g. 0.8 for small asteroid, 1.0 for terrestrial planet, 2.4 for gas giant/star),
    "textureType": "rocky" | "gaseous" | "icy",
    "hasRings": boolean (true only if planetary ring system exists, e.g. Saturn/Uranus)
  }
}`;

      const res = await callGemini(geminiKey, prompt);
      const parsed = parseJsonFromLlm(res);
      const rs = parsed?.renderState || parsed;
      if (rs && typeof rs.baseColor === 'string') {
        const validTexture: TextureType = ['rocky', 'gaseous', 'icy'].includes(rs.textureType)
          ? rs.textureType
          : 'rocky';

        return {
          baseColor: sanitizeHexColor(rs.baseColor, '#8C827A'),
          scale: typeof rs.scale === 'number' && rs.scale > 0 ? Number(rs.scale.toFixed(2)) : 1.0,
          textureType: validTexture,
          hasRings: Boolean(rs.hasRings),
          tag: 'Illustrative', // Rule 2 Non-Negotiable
        };
      }
    } catch (exc) {
      console.warn('[Agent 3: Procedural Compiler] Gemini API call failed. Using deterministic compiler rules:', exc);
    }
  }

  // Deterministic Fallback Compiler
  return fallbackCompiler(extracted);
}

function fallbackCompiler(extracted: ExtractedObject): RenderState {
  const name = extracted.name.toLowerCase();
  const summary = extracted.summary.toLowerCase();

  let baseColor = '#8C827A';
  let scale = 1.0;
  let textureType: TextureType = 'rocky';
  let hasRings = false;

  if (extracted.classification === 'star') {
    baseColor = '#FFAE42';
    scale = 2.5;
    textureType = 'gaseous';
    hasRings = false;
  } else if (extracted.classification === 'comet') {
    baseColor = '#B0E0E6';
    scale = 0.75;
    textureType = 'icy';
    hasRings = false;
  } else if (extracted.classification === 'asteroid') {
    if (summary.includes('metallic') || name.includes('psyche')) {
      baseColor = '#9E9E9E';
      scale = 0.95;
    } else if (summary.includes('carbon') || summary.includes('bennu') || summary.includes('ryugu')) {
      baseColor = '#3A3A3C';
      scale = 0.85;
    } else {
      baseColor = '#8C827A';
      scale = 0.9;
    }
    textureType = 'rocky';
    hasRings = false;
  } else {
    // Planet / Dwarf Planet / Moon
    if (name.includes('saturn') || summary.includes('rings')) {
      baseColor = '#E2BF7D';
      scale = 2.2;
      textureType = 'gaseous';
      hasRings = true;
    } else if (name.includes('jupiter') || summary.includes('gas giant')) {
      baseColor = '#C88B3A';
      scale = 2.4;
      textureType = 'gaseous';
      hasRings = false;
    } else if (name.includes('neptune') || name.includes('uranus')) {
      baseColor = '#4B70DD';
      scale = 1.6;
      textureType = 'icy';
      hasRings = name.includes('uranus');
    } else if (name.includes('mars')) {
      baseColor = '#C1440E';
      scale = 0.85;
      textureType = 'rocky';
    } else if (name.includes('europa') || name.includes('enceladus') || summary.includes('ice')) {
      baseColor = '#E0F2FE';
      scale = 0.8;
      textureType = 'icy';
    } else {
      baseColor = '#4B88A2';
      scale = 1.0;
      textureType = 'rocky';
    }
  }

  return {
    baseColor,
    scale,
    textureType,
    hasRings,
    tag: 'Illustrative', // Rule 2 Non-Negotiable
  };
}

function sanitizeHexColor(val: string, fallback: string): string {
  if (/^#([0-9A-F]{3}){1,2}$/i.test(val)) {
    return val.toUpperCase();
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Google Gemini API Gateway
// ---------------------------------------------------------------------------

async function callGemini(apiKey: string, prompt: string, model = 'gemini-2.5-flash'): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API returned empty candidate content.');
  }
  return text;
}

function parseJsonFromLlm(text: string): any {
  try {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (err) {
    // Attempt relaxed regex extraction
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Orchestrator: Multi-Agent Execution Pipeline
// ---------------------------------------------------------------------------

export async function executeMultiAgentPipeline(
  targetUrl: string,
  apiKey?: string,
  timeoutMs = 12000
): Promise<NasaObjectPayload> {
  // Step 1: Agent 1 (Scraper)
  const scraped = await scrapeNasaUrl(targetUrl, timeoutMs);

  // Step 2: Agent 2 (Extractor)
  const extracted = await extractObjectDetails(scraped, apiKey);

  // Step 3: Agent 3 (Procedural Compiler)
  const renderState = await compileProceduralRenderState(extracted, apiKey);

  // Step 4: Consolidated Bento-Grid Data Payload
  return {
    name: extracted.name,
    classification: extracted.classification,
    summary: extracted.summary,
    images: extracted.images,
    renderState,
  };
}
