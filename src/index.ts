import { handleCalendarRequest } from "./routes/calendar/index.js";
import { RequestError } from "./routes/calendar/request.js";
import { handleHealthCheck } from "./routes/health/index.js";
import type { Env } from "./types.js";

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function methodNotAllowed(): Response {
  return new Response("Method not allowed", { status: 405 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return handleHealthCheck();
    }

    if (url.pathname === "/events") {
      try {
        return await handleCalendarRequest(request, env);
      } catch (error) {
        if (error instanceof RequestError) {
          return new Response(
            JSON.stringify({ error: error.message }),
            {
              status: error.status,
              headers: { "Content-Type": "application/json; charset=utf-8" },
            },
          );
        }
        if (error instanceof Response) {
          return error;
        }
        console.error("Failed to process calendar request", error);
        return Response.json(
          {
            error: "Failed to fetch calendar data",
          },
          { status: 502 },
        );
      }
    }

    return notFound();
  },
};
