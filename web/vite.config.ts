import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { executeMultiAgentPipeline } from './src/api/fetchNasaObjectWorkflow';
import { executeExploreObjectWorkflow } from './src/api/exploreObjectWorkflow';

function nasaApiDevPlugin(): Plugin {
  return {
    name: 'nasa-object-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/explore-object', async (req, res) => {
        if (req.method === 'POST' || req.method === 'GET') {
          try {
            let query: string | undefined;

            if (req.method === 'GET') {
              const reqUrl = req.url || '';
              const parsedUrl = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
              query = parsedUrl.searchParams.get('query') || undefined;
            } else if (req.method === 'POST') {
              const bodyStr = await new Promise<string>((resolve) => {
                let data = '';
                req.on('data', (chunk) => {
                  data += chunk;
                });
                req.on('end', () => resolve(data));
              });
              try {
                const parsedBody = JSON.parse(bodyStr);
                query = parsedBody.query;
              } catch {}
            }

            if (!query || typeof query !== 'string' || !query.trim()) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: "Field 'query' is required (URL or object name)." }));
              return;
            }

            const payload = await executeExploreObjectWorkflow(query.trim());
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
            res.end(JSON.stringify(payload));
          } catch (err: any) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Failed to explore celestial object.' }));
          }
        } else {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method Not Allowed. Use POST with { query: string }.' }));
        }
      });

      server.middlewares.use('/api/fetch-nasa-object', async (req, res) => {
        if (req.method === 'GET' || req.method === 'POST') {
          try {
            const reqUrl = req.url || '';
            const parsedUrl = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
            let targetUrl = parsedUrl.searchParams.get('url');

            if (!targetUrl && req.method === 'POST') {
              const bodyStr = await new Promise<string>((resolve) => {
                let data = '';
                req.on('data', (chunk) => {
                  data += chunk;
                });
                req.on('end', () => resolve(data));
              });
              try {
                const parsedBody = JSON.parse(bodyStr);
                targetUrl = parsedBody.url;
              } catch {}
            }

            if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.trim()) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: "Missing or invalid 'url' parameter." }));
              return;
            }

            const payload = await executeMultiAgentPipeline(targetUrl.trim());
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
            res.end(JSON.stringify(payload));
          } catch (err: any) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Failed to process NASA celestial object URL.' }));
          }
        } else {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method Not Allowed. Use GET or POST.' }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), nasaApiDevPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 4096,
  },
});
