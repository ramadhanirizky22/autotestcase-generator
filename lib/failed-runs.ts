import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CrawlError } from "./crawler";
import { DeepSeekError } from "./deepseek";

const FAILED_DIR = process.env.FAILED_RUNS_DIR || join(process.cwd(), "failed-runs");

export type FailedRunInput = {
  /** The error that occurred. */
  error: unknown;
  /** Original request — credentials should already be redacted. */
  request: {
    url: string;
    used_login: boolean;
    login_url?: string | null;
    auto_crud: boolean;
    /** Custom login selectors, if any (no credentials). */
    login_selectors?: {
      username?: string | null;
      password?: string | null;
      submit?: string | null;
    };
  };
  /** When the request started. */
  startedAt: Date;
  /** When the request failed. */
  failedAt?: Date;
};

export type FailedRunArtifacts = {
  folder: string;
  files: string[];
};

function safeId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const r = Math.random().toString(36).slice(2, 8);
  return `${ts}-${r}`;
}

function extractErrorInfo(err: unknown): {
  name: string;
  code: string | null;
  message: string;
  stack: string | null;
  artifacts: { screenshotPath?: string; tracePath?: string };
  rawContent?: string;
} {
  if (err instanceof CrawlError) {
    return {
      name: "CrawlError",
      code: err.code,
      message: err.message,
      stack: err.stack ?? null,
      artifacts: err.artifacts ?? {},
    };
  }
  if (err instanceof DeepSeekError) {
    return {
      name: "DeepSeekError",
      code: err.code,
      message: err.message,
      stack: err.stack ?? null,
      artifacts: {},
      rawContent: err.rawContent,
    };
  }
  if (err instanceof Error) {
    return {
      name: err.name,
      code: null,
      message: err.message,
      stack: err.stack ?? null,
      artifacts: {},
    };
  }
  return {
    name: "Unknown",
    code: null,
    message: String(err),
    stack: null,
    artifacts: {},
  };
}

/**
 * Save details of a failed generate run to a per-run folder under
 * `failed-runs/`. Returns the folder path so the API can include it
 * in the error response.
 *
 * Folder layout:
 *   failed-runs/<timestamp>-<id>/
 *     info.json          — request metadata + error code/message
 *     error.log          — full message + stack trace
 *     deepseek_response.txt — raw LLM response if JSON parse failed
 *     screenshot.png     — copied from the crawler's screenshot, if any
 *     trace.zip          — copied from Playwright trace, if any
 */
export async function saveFailedRun(input: FailedRunInput): Promise<FailedRunArtifacts | null> {
  try {
    const id = safeId();
    const folder = join(FAILED_DIR, id);
    await mkdir(folder, { recursive: true });

    const info = extractErrorInfo(input.error);
    const failedAt = input.failedAt ?? new Date();
    const durationMs = failedAt.getTime() - input.startedAt.getTime();

    // info.json
    const infoPayload = {
      id,
      timestamp: failedAt.toISOString(),
      started_at: input.startedAt.toISOString(),
      duration_ms: durationMs,
      request: input.request,
      error: {
        name: info.name,
        code: info.code,
        message: info.message,
      },
      artifacts: {
        screenshot: info.artifacts.screenshotPath ? "screenshot.png" : null,
        trace: info.artifacts.tracePath ? "trace.zip" : null,
        raw_response: info.rawContent ? "deepseek_response.txt" : null,
      },
    };
    const infoPath = join(folder, "info.json");
    await writeFile(infoPath, JSON.stringify(infoPayload, null, 2), "utf-8");

    // error.log
    const errLog = [
      `Error: ${info.name}${info.code ? ` (${info.code})` : ""}`,
      `Time: ${failedAt.toISOString()}`,
      `Duration: ${durationMs}ms`,
      "",
      `Message:`,
      info.message,
      "",
      `Stack:`,
      info.stack ?? "(no stack)",
    ].join("\n");
    const errLogPath = join(folder, "error.log");
    await writeFile(errLogPath, errLog, "utf-8");

    const files = [infoPath, errLogPath];

    if (info.rawContent) {
      const respPath = join(folder, "deepseek_response.txt");
      await writeFile(respPath, info.rawContent, "utf-8").then(
        () => files.push(respPath),
        () => {}
      );
    }

    // Copy screenshot if available.
    if (info.artifacts.screenshotPath) {
      const dest = join(folder, "screenshot.png");
      await copyFile(info.artifacts.screenshotPath, dest).then(
        () => files.push(dest),
        () => {}
      );
    }

    // Copy trace if available.
    if (info.artifacts.tracePath) {
      const dest = join(folder, "trace.zip");
      await copyFile(info.artifacts.tracePath, dest).then(
        () => files.push(dest),
        () => {}
      );
    }

    return { folder, files };
  } catch {
    // Saving failure data should NEVER mask the original error. If
    // anything goes wrong here, just give up silently.
    return null;
  }
}
