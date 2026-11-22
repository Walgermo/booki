import { handleBooksRequest } from "../server/books-handler";

// Serverless entry (Vercel Functions, Web-standard handlers): the demo company's guarded write API.
export const POST = (request: Request) => handleBooksRequest(request);
export const GET = (request: Request) => handleBooksRequest(request);
