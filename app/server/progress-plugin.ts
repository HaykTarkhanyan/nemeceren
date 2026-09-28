// Vite plugin with two jobs:
// 1. Dev server only: a small JSON file API under /api/progress that reads and writes
//    files inside the progress folder (and nowhere else).
// 2. Build only: the virtual module "virtual:review-snapshot", which embeds
//    progress/review-state.json (if it exists) so phone mode starts where the PC was.
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

export class PathError extends Error {}

// Every segment must start with a letter, digit, "_" or "-", so "." and ".." can never appear.
const SAFE_REL_PATH = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/
const MAX_BODY_BYTES = 1_000_000

/** Resolve a client-supplied relative path inside root. Throws PathError on anything suspicious. */
export function resolveInside(root: string, rel: string, extensions: string[] | null): string {
  if (!SAFE_REL_PATH.test(rel)) {
    throw new PathError(
      `Bad path "${rel}": use a relative path of letters, digits, "_", "-", "." with "/" separators`,
    )
  }
  if (extensions && !extensions.some((ext) => rel.endsWith(ext))) {
    throw new PathError(`Bad path "${rel}": must end with ${extensions.join(' or ')}`)
  }
  const abs = path.resolve(root, rel)
  const back = path.relative(root, abs)
  if (back === '' || back.startsWith('..') || path.isAbsolute(back)) {
    throw new PathError(`Bad path "${rel}": resolves outside the progress folder`)
  }
  return abs
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, `Request body larger than ${MAX_BODY_BYTES} bytes`)
    chunks.push(buf)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new HttpError(400, `Request body is not valid JSON: ${(err as Error).message}`)
  }
}

function writeFileAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)
}

export function createProgressHandler(progressDir: string) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const relFile = url.searchParams.get('path')
    const relDir = url.searchParams.get('dir')

    if (req.method === 'GET' && relDir !== null) {
      // List a folder: returns every *.json file with its parsed content.
      const dir = resolveInside(progressDir, relDir, null)
      if (!fs.existsSync(dir)) {
        sendJson(res, 200, { files: [] })
        return
      }
      const names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()
      const files = names.map((name) => {
        const text = fs.readFileSync(path.join(dir, name), 'utf8')
        try {
          return { name, data: JSON.parse(text) as unknown }
        } catch (err) {
          throw new HttpError(500, `${relDir}/${name} is not valid JSON: ${(err as Error).message}`)
        }
      })
      sendJson(res, 200, { files })
      return
    }

    if (relFile === null) throw new HttpError(400, 'Missing "path" or "dir" query parameter')

    if (req.method === 'GET') {
      const file = resolveInside(progressDir, relFile, ['.json', '.jsonl'])
      if (!fs.existsSync(file)) throw new HttpError(404, `${relFile} does not exist yet`)
      const text = fs.readFileSync(file, 'utf8')
      if (relFile.endsWith('.jsonl')) {
        // One JSON value per line; returned as { lines: [...] }.
        const lines = text.split('\n').filter((l) => l.trim() !== '')
        const values = lines.map((l, i) => {
          try {
            return JSON.parse(l) as unknown
          } catch (err) {
            throw new HttpError(500, `${relFile} line ${i + 1} is not valid JSON: ${(err as Error).message}`)
          }
        })
        sendJson(res, 200, { lines: values })
        return
      }
      try {
        sendJson(res, 200, JSON.parse(text))
      } catch (err) {
        throw new HttpError(500, `${relFile} is not valid JSON: ${(err as Error).message}`)
      }
      return
    }

    if (req.method === 'PUT') {
      // Replace a whole .json file.
      const file = resolveInside(progressDir, relFile, ['.json'])
      const body = await readBody(req)
      writeFileAtomic(file, JSON.stringify(body, null, 2) + '\n')
      sendJson(res, 200, { ok: true, path: relFile })
      return
    }

    if (req.method === 'POST') {
      // Append one JSON object as a line to a .jsonl file.
      const file = resolveInside(progressDir, relFile, ['.jsonl'])
      const body = await readBody(req)
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new HttpError(400, 'Append body must be a JSON object')
      }
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.appendFileSync(file, JSON.stringify(body) + '\n', 'utf8')
      sendJson(res, 200, { ok: true, path: relFile })
      return
    }

    throw new HttpError(405, `Method ${req.method} not allowed`)
  }
}

const SNAPSHOT_ID = 'virtual:review-snapshot'
const RESOLVED_SNAPSHOT_ID = '\0' + SNAPSHOT_ID

export function progressPlugin(opts: { progressDir: string; contentDir: string }): Plugin {
  let isBuild = false
  return {
    name: 'nemeceren-progress',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    configureServer(server) {
      // Content lives outside the Vite root. Watch it so new test files show up without a restart.
      server.watcher.add(opts.contentDir)
      server.config.logger.info(`  progress API writes to: ${opts.progressDir}`)
      const handle = createProgressHandler(opts.progressDir)
      server.middlewares.use('/api/progress', (req, res) => {
        handle(req, res).catch((err: unknown) => {
          const status = err instanceof HttpError ? err.status : err instanceof PathError ? 400 : 500
          const message = err instanceof Error ? err.message : String(err)
          server.config.logger.error(`[progress API] ${req.method} ${req.url} -> ${status}: ${message}`)
          sendJson(res, status, { error: message })
        })
      })
    },
    resolveId(id) {
      if (id === SNAPSHOT_ID) return RESOLVED_SNAPSHOT_ID
      return null
    },
    load(id) {
      if (id !== RESOLVED_SNAPSHOT_ID) return null
      if (!isBuild) return 'export default null'
      const file = path.join(opts.progressDir, 'review-state.json')
      if (!fs.existsSync(file)) return 'export default null'
      const text = fs.readFileSync(file, 'utf8')
      try {
        JSON.parse(text)
      } catch (err) {
        throw new Error(`${file} is not valid JSON: ${(err as Error).message}`)
      }
      return `export default ${text}`
    },
  }
}
