import type { NextRequest } from "next/server";
import {
  type Answer,
  filesMatching,
  filesWithRole,
  neighboursOf,
  routeTableOf,
  summaryOf,
  walkFrom,
} from "@/lib/agent/answers";
import { readAgentMap } from "@/lib/agent/read";

// The agent's read-only surface. No session: the bearer credential is the only
// thing that says what may be read, and Postgres checks it, not this file. Every
// lookup is a GET, and nothing here writes.

function say(status: number, message: string): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function reply<T>(answer: Answer<T>): Response {
  return answer.ok ? Response.json(answer.body) : say(answer.status, answer.message);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ lookup: string }> }) {
  const credential = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!credential) return say(401, "No credential.");

  const read = await readAgentMap(credential);
  if (read.kind === "denied") return say(401, "The credential is invalid or has expired.");
  if (read.kind === "not-ready") return say(409, "This analysis has no finished map to read.");
  const { map } = read;

  const query = request.nextUrl.searchParams;
  const path = query.get("path");
  const { lookup } = await params;

  switch (lookup) {
    case "summary":
      return Response.json(summaryOf(map));
    case "files": {
      const search = query.get("search");
      const role = query.get("role");
      if (search && !role) return Response.json(filesMatching(map, search));
      if (role && !search) return reply(filesWithRole(map, role));
      return say(400, "Give either part of a path or a role, not both.");
    }
    case "neighbours":
      if (!path) return say(400, "Give a file path.");
      return reply(neighboursOf(map, path));
    case "walk": {
      const direction = query.get("direction");
      if (!path) return say(400, "Give a file path.");
      if (direction !== "dependents" && direction !== "dependencies") {
        return say(400, "Direction is dependents or dependencies.");
      }
      return reply(walkFrom(map, path, direction));
    }
    case "routes":
      return Response.json(routeTableOf(map));
    default:
      return say(404, `No lookup called ${lookup}.`);
  }
}
