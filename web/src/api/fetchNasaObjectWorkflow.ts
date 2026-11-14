/**
 * fetchNasaObjectWorkflow.ts
 * Multi-Agent Workflow to scrape NASA articles and compile procedural 3D parameters.
 *
 * Architecture:
 * - Sub-Agent 1 (Scraper): Accepts target NASA URL in request body, fetches raw HTML,
 *   extracts clean <article> text, and harvests candidate <img> URLs.
 * - Sub-Agent 2 (Extractor & 3D Compiler): Uses the official Google Gemini API SDK
 *   (@google/generative-ai) with `gemini-1.5-flash`, `responseMimeType: "application/json"`,
 *   and strict system instructions to extract astronomical metadata and compile procedural
 *   3D rendering parameters ({ name, classification, summary, images, renderState }).
 * - Robust Fallback & Error Handling: Gracefully falls back to heuristic astronomical
 *   rules if API keys are omitted or rate-limited; strictly validates inputs and formats.
 * - Non-Negotiable Compliance: Enforces Rule 2 (`tag: "Illustrative"`) on all 3D render states.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

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
// Helpers
// ---------------------------------------------------------------------------

export function getGeminiApiKey(explicitKey?: string): string | undefined {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim();
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      return process.env.GEMINI_API_KEY.trim();
    }
    if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim()) {
      return process.env.GOOGLE_API_KEY.trim();
    }
    if (process.env.VITE_GEMINI_API_KEY && process.env.VITE_GEMINI_API_KEY.trim()) {
      return process.env.VITE_GEMINI_API_KEY.trim();
    }
  }
  return undefined;
}

export function sanitizeHexColor(val: any, fallback = '#8C827A'): string {
  if (typeof val === 'string' && /^#([0-9A-F]{3}){1,2}$/i.test(val.trim())) {
    return val.trim().toUpperCase();
  }
  return fallback;
}

export function cleanHtmlText(raw: string): string {
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

export function parseJsonFromLlm(text: string): any {
  try {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (err) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Sub-Agent 1: Scraper
// ---------------------------------------------------------------------------

/**
 * Sub-Agent 1 (Scraper): Accepts a NASA URL, fetches raw HTML,
 * extracts main <article> text and harvests <img> URLs.
 */
export async function subAgent1Scraper(rawUrl: string, timeoutMs = 12000): Promise<ScrapedData> {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
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
  const title = titleMatch ? cleanHtmlText(titleMatch[1]).replace(/\s*\|\s*NASA.*$/i, '').trim() : '';

  // 2. Extract main <article> text
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

  // Clean boilerplate tags
  const cleanHtml = rawArticle
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');

  const articleText = cleanHtmlText(cleanHtml);

  // 3. Extract <img> source URLs
  const imgRegex = /<img\b[^>]*?\b(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  const rawImageUrls: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = imgRegex.exec(rawArticle)) !== null) {
    const src = m[1]?.trim();
    if (src && !src.startsWith('data:') && !src.includes('1x1') && !src.includes('blank.gif')) {
      try {
        const resolved = new URL(src, parsedUrl.href).href;
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

  // If article block yielded 0 images, check the wider document
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
    articleText: articleText.slice(0, 8000), // Cap context window to prevent token overflow
    images: rawImageUrls.slice(0, 10),
  };
}

// Alias for backwards compatibility
export const scrapeNasaUrl = subAgent1Scraper;

// ---------------------------------------------------------------------------
// Sub-Agent 2: Extractor & 3D Compiler (Official Google Gemini SDK)
// ---------------------------------------------------------------------------

const SUBAGENT_2_SYSTEM_INSTRUCTION = `You are an astronomical data extractor and procedural 3D compiler in a NASA science pipeline.
Your mission is to analyze scraped NASA articles and extract accurate astronomical metadata while compiling 3D procedural rendering parameters.
Strict Rule: You must return valid JSON matching the exact schema requested with no markdown commentary.`;

/**
 * Sub-Agent 2 (Extractor & 3D Compiler): Uses the official @google/generative-ai SDK,
 * initializing GoogleGenerativeAI with process.env.GEMINI_API_KEY, utilizing model 'gemini-1.5-flash',
 * and enforcing JSON output via responseMimeType: "application/json".
 *
 * Expected Schema:
 * {
 *   "name": "string",
 *   "classification": "planet | asteroid | comet | star",
 *   "summary": "string",
 *   "images": ["string"],
 *   "renderState": {
 *     "baseColor": "hex code",
 *     "scale": "number",
 *     "textureType": "rocky | gaseous | icy",
 *     "hasRings": "boolean"
 *   }
 * }
 */
export async function subAgent2ExtractorAndCompiler(
  scraped: ScrapedData,
  apiKey?: string
): Promise<NasaObjectPayload> {
  const geminiKey = getGeminiApiKey(apiKey);

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: SUBAGENT_2_SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const prompt = `Analyze the following scraped NASA article and candidate image URLs.
Extract the celestial object's identity and compile procedural 3D render parameters.

Return a single JSON object matching this exact schema:
{
  "name": "string",
  "classification": "planet | asteroid | comet | star",
  "summary": "string",
  "images": ["string"],
  "renderState": {
    "baseColor": "hex code",
    "scale": 1.0,
    "textureType": "rocky | gaseous | icy",
    "hasRings": false
  }
}

Guidelines:
1. "name": The primary celestial name (e.g. "Europa", "101955 Bennu", "1P/Halley", "Betelgeuse").
2. "classification": One of "planet", "asteroid", "comet", "star".
3. "summary": Concise 1-2 sentence overview of its physical traits and scientific significance.
4. "images": Up to 4 most relevant image URLs selected from the candidate images list.
5. "renderState.baseColor": Hex color code representing realistic astronomical surface albedo (e.g. "#8C827A" for rocky asteroid, "#D97706" for Jupiter, "#B0E0E6" for comet, "#FFAE42" for star).
6. "renderState.scale": Relative positive scale float (e.g. 0.8 for small asteroid, 1.0 for terrestrial body, 2.2 for gas giant or star).
7. "renderState.textureType": Exactly one of "rocky", "gaseous", or "icy".
8. "renderState.hasRings": true only if a planetary ring system exists (e.g. Saturn, Uranus).

Article Title: ${scraped.title}
Target URL: ${scraped.url}
Article Text:
${scraped.articleText.slice(0, 4500)}

Candidate Images:
${JSON.stringify(scraped.images)}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const parsed = parseJsonFromLlm(responseText);

      if (parsed && typeof parsed.name === 'string') {
        const validClassification: ObjectClassification = ['planet', 'asteroid', 'comet', 'star'].includes(
          parsed.classification
        )
          ? parsed.classification
          : 'asteroid';

        const rs = parsed.renderState || {};
        const validTexture: TextureType = ['rocky', 'gaseous', 'icy'].includes(rs.textureType)
          ? rs.textureType
          : 'rocky';

        const chosenImages = Array.isArray(parsed.images) && parsed.images.length > 0
          ? parsed.images.filter((img: any) => typeof img === 'string' && img.startsWith('http'))
          : scraped.images.slice(0, 4);

        return {
          name: String(parsed.name).trim(),
          classification: validClassification,
          summary: String(parsed.summary || `${parsed.name} is an astronomical object observed by NASA.`).trim(),
          images: chosenImages.length > 0 ? chosenImages : scraped.images.slice(0, 4),
          renderState: {
            baseColor: sanitizeHexColor(rs.baseColor, '#8C827A'),
            scale: typeof rs.scale === 'number' && rs.scale > 0 ? Number(rs.scale.toFixed(2)) : 1.0,
            textureType: validTexture,
            hasRings: Boolean(rs.hasRings),
            tag: 'Illustrative', // Rule 2 Non-Negotiable
          },
        };
      }
    } catch (exc) {
      console.warn(
        '[Sub-Agent 2: Extractor & 3D Compiler] Gemini 1.5 Flash SDK call failed or unconfigured. Proceeding with deterministic fallback:',
        exc
      );
    }
  }

  // Graceful Deterministic Fallback if API key missing or request throttled
  return fallbackExtractorAndCompiler(scraped);
}

// Alias for convenience
export const extractAndCompileNasaObject = subAgent2ExtractorAndCompiler;

// ---------------------------------------------------------------------------
// Deterministic Fallback Extractor & 3D Compiler
// ---------------------------------------------------------------------------

export function fallbackExtractorAndCompiler(scraped: ScrapedData): NasaObjectPayload {
  // 1. Resolve name
  let name = scraped.title || 'NASA Celestial Object';
  const nameMatch = scraped.title.match(/(?:about|overview|mission to|exploring|target)?\s*([A-Z0-9\s\-_–—]+)/i);
  if (nameMatch && nameMatch[1].trim().length > 2) {
    name = nameMatch[1].trim();
  }

  // 2. Resolve classification
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

  // 3. Resolve summary
  const sentences = scraped.articleText
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 25 && !s.toLowerCase().includes('skip to') && !s.toLowerCase().includes('menu'));
  const summary =
    sentences.slice(0, 2).join(' ') ||
    `${name} is a celestial ${classification} documented in NASA planetary exploration archives.`;

  // 4. Procedural 3D renderState
  const lowerName = name.toLowerCase();
  const lowerSummary = summary.toLowerCase();

  let baseColor = '#8C827A';
  let scale = 1.0;
  let textureType: TextureType = 'rocky';
  let hasRings = false;

  if (classification === 'star') {
    baseColor = '#FFAE42';
    scale = 2.5;
    textureType = 'gaseous';
    hasRings = false;
  } else if (classification === 'comet') {
    baseColor = '#B0E0E6';
    scale = 0.75;
    textureType = 'icy';
    hasRings = false;
  } else if (classification === 'asteroid') {
    if (lowerSummary.includes('metallic') || lowerName.includes('psyche')) {
      baseColor = '#9E9E9E';
      scale = 0.95;
    } else if (lowerSummary.includes('carbon') || lowerName.includes('bennu') || lowerName.includes('ryugu')) {
      baseColor = '#3A3A3C';
      scale = 0.85;
    } else {
      baseColor = '#8C827A';
      scale = 0.9;
    }
    textureType = 'rocky';
    hasRings = false;
  } else {
    // Planet / Moon / Dwarf Planet
    if (lowerName.includes('saturn') || lowerSummary.includes('rings')) {
      baseColor = '#E2BF7D';
      scale = 2.2;
      textureType = 'gaseous';
      hasRings = true;
    } else if (lowerName.includes('jupiter') || lowerSummary.includes('gas giant')) {
      baseColor = '#C88B3A';
      scale = 2.4;
      textureType = 'gaseous';
      hasRings = false;
    } else if (lowerName.includes('neptune') || lowerName.includes('uranus')) {
      baseColor = '#4B70DD';
      scale = 1.6;
      textureType = 'icy';
      hasRings = lowerName.includes('uranus');
    } else if (lowerName.includes('mars')) {
      baseColor = '#C1440E';
      scale = 0.85;
      textureType = 'rocky';
    } else if (lowerName.includes('europa') || lowerName.includes('enceladus') || lowerSummary.includes('ice')) {
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
    name,
    classification,
    summary,
    images: scraped.images.slice(0, 4),
    renderState: {
      baseColor,
      scale,
      textureType,
      hasRings,
      tag: 'Illustrative', // Rule 2 Non-Negotiable
    },
  };
}

// ---------------------------------------------------------------------------
// Backward Compatibility Adapters (extractObjectDetails, compileProceduralRenderState)
// ---------------------------------------------------------------------------

export async function extractObjectDetails(
  scraped: ScrapedData,
  apiKey?: string
): Promise<ExtractedObject> {
  const result = await subAgent2ExtractorAndCompiler(scraped, apiKey);
  return {
    name: result.name,
    classification: result.classification,
    summary: result.summary,
    images: result.images,
  };
}

export async function compileProceduralRenderState(
  extracted: ExtractedObject,
  apiKey?: string
): Promise<RenderState> {
  const mockScraped: ScrapedData = {
    url: '',
    title: extracted.name,
    articleText: extracted.summary,
    images: extracted.images,
  };
  const result = await subAgent2ExtractorAndCompiler(mockScraped, apiKey);
  return result.renderState;
}

// ---------------------------------------------------------------------------
// Orchestrator: Multi-Agent Execution Pipeline
// ---------------------------------------------------------------------------

export async function executeMultiAgentPipeline(
  targetUrl: string,
  apiKey?: string,
  timeoutMs = 12000
): Promise<NasaObjectPayload> {
  // Step 1: Sub-Agent 1 (Scraper)
  const scraped = await subAgent1Scraper(targetUrl, timeoutMs);

  // Step 2 & 3: Sub-Agent 2 (Extractor & 3D Compiler)
  const payload = await subAgent2ExtractorAndCompiler(scraped, apiKey);

  // Guarantee Rule 2 compliance
  if (!payload.renderState.tag) {
    payload.renderState.tag = 'Illustrative';
  }

  return payload;
}
