import { handleAgentRequest } from "../server/agent-handler";

// Serverless entry (Vercel Functions, Web-standard handlers).
export const GET = (request: Request) => handleAgentRequest(request);
export const POST = (request: Request) => handleAgentRequest(request);
