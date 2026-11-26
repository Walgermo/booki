import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

type Handler = (request: Request) => Promise<Response>;

/**
 * Serves /api/agent (the live agent) and /api/books (the demo company's
 * guarded write API) in development, with the same handlers the serverless
 * functions use in production (server/*.ts).
 */
function serverApi(): Plugin {
  const routes: [string, string, string][] = [
    ["/api/agent", "/server/agent-handler.ts", "handleAgentRequest"],
    ["/api/books", "/server/books-handler.ts", "handleBooksRequest"],
  ];
  return {
    name: "booki-server-api",
    configureServer(server) {
      for (const [path, file, name] of routes) {
        server.middlewares.use(path, (req, res) => {
          // Every failure is answered below, so nothing is left for the server to catch.
          void (async () => {
            try {
              const chunks: Buffer[] = [];
              for await (const chunk of req) chunks.push(chunk as Buffer);
              const body = Buffer.concat(chunks);
              const handler = ((await server.ssrLoadModule(file)) as Record<string, Handler>)[name]!;
              const response = await handler(
                new Request(`http://localhost${req.originalUrl ?? path}`, {
                  method: req.method,
                  headers: req.headers as Record<string, string>,
                  body: req.method === "POST" ? body : undefined,
                }),
              );
              res.statusCode = response.status;
              response.headers.forEach((value, key) => res.setHeader(key, value));
              res.end(await response.text());
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify({ error: String(error) }));
            }
          })();
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Lets a key in apps/www/.env.local reach the dev server. Never bundled.
  const env = loadEnv(mode, __dirname, "ANTHROPIC_");
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  }

  return {
    plugins: [react(), tailwindcss(), serverApi()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      rollupOptions: {
        output: {
          // React and the router change far less often than the site: their own
          // chunk stays cached across deploys.
          manualChunks(id) {
            if (
              /node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?(react|react-dom|react-router|react-router-dom|scheduler)\//.test(
                id,
              )
            ) {
              return "react-vendor";
            }
          },
        },
      },
    },
  };
});
