import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import type { CryptoService } from '../crypto/cryptoService'
import type { SyncAccount, SyncCategory, MergeStats } from './mergeService'

const SESSION_TTL_MS = 120_000 // 2 minutos

export interface SyncSession {
  qrData: string    // base64 del payload QR (scheme pmvault://<base64json>)
  expiresAt: number
  /** IP primaria — útil para mostrar en logs/UI */
  ip: string
  /** Todas las IPs detectadas, embedidas en el QR para que el móvil pruebe cada una */
  ips: string[]
  port: number
}

export type SyncEvent =
  | { type: 'connected' }
  | { type: 'merged'; stats: MergeStats }
  | { type: 'expired' }
  | { type: 'error'; message: string }

/** Payload que viaja en cualquier dirección por POST /sync (cifrado con session key). */
export interface SyncStatePayload {
  accounts: SyncAccount[]
  categories: SyncCategory[]
  /** Solo viaja en la respuesta del desktop al móvil. */
  exportedAt?: string
  /** Estadísticas del merge, solo en la respuesta. */
  stats?: MergeStats
  v: number
}

/** Función que el orchestrator (IPC) provee para realizar el merge en main. */
export type MergeHandler = (incoming: SyncStatePayload) => SyncStatePayload

export class SyncServer {
  private server: Server | null = null
  private sessionKey: Buffer | null = null
  private expiresAt = 0
  private onEvent?: (e: SyncEvent) => void
  private mergeHandler?: MergeHandler

  constructor(private readonly crypto: CryptoService) {}

  setEventListener(fn: (e: SyncEvent) => void) { this.onEvent = fn }
  private emit(e: SyncEvent) { this.onEvent?.(e) }

  /** Todas las IPs IPv4 no-internas de la máquina, en orden de prioridad razonable.
   *  Se incluyen TODAS (Ethernet, WiFi, hotspot, VPN, Docker) porque a priori no
   *  sabemos cuál podrá alcanzar el móvil. El móvil prueba cada una hasta que
   *  alguna conteste. */
  private getAllLocalIPs(): string[] {
    const nets = networkInterfaces()
    const ips: string[] = []
    for (const ifaces of Object.values(nets)) {
      for (const iface of ifaces ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address)
        }
      }
    }
    // Dedup defensivo y fallback a loopback si no hay nada
    const unique = [...new Set(ips)]
    return unique.length > 0 ? unique : ['127.0.0.1']
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = createNetServer()
      srv.listen(0, '0.0.0.0', () => {
        const addr = srv.address()
        if (!addr || typeof addr === 'string') { reject(new Error('no address')); return }
        srv.close(() => resolve(addr.port))
      })
    })
  }

  /**
   * Arranca el servidor de sync. El `mergeHandler` se invoca cuando el móvil
   * envía su estado: recibe el estado entrante, fusiona con el estado del
   * desktop (en la DB), aplica los cambios localmente y devuelve el estado
   * fusionado completo que será cifrado y devuelto al móvil.
   */
  async start(mergeHandler: MergeHandler): Promise<SyncSession> {
    await this.stop()

    this.mergeHandler = mergeHandler
    this.sessionKey   = randomBytes(32)
    this.expiresAt    = Date.now() + SESSION_TTL_MS

    const port = await this.findFreePort()
    const ips  = this.getAllLocalIPs()
    const primaryIp = ips[0]

    // QR v2: incluye `ips` (todas las interfaces) y `ip` (primaria) para
    // compatibilidad hacia atrás con apps móviles v1.
    const qrPayload = JSON.stringify({
      ip: primaryIp,        // fallback v1
      ips,                  // v2 — móvil probará cada una
      port,
      key: this.sessionKey.toString('base64'),
      exp: this.expiresAt,
      v: 2
    })
    const qrData = `pmvault://${Buffer.from(qrPayload).toString('base64')}`

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res))

      this.server.once('error', reject)

      this.server.listen(port, '0.0.0.0', () => {
        // Auto-expirar la sesión cuando llega su TTL
        setTimeout(() => { this.emit({ type: 'expired' }); this.stop() }, SESSION_TTL_MS)
        resolve({ qrData, expiresAt: this.expiresAt, ip: primaryIp, ips, port })
      })
    })
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS — móvil hace fetch con Authorization
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    // TTL
    if (Date.now() > this.expiresAt) {
      this.respondJson(res, 401, { error: 'expired' })
      this.emit({ type: 'expired' })
      return
    }

    // Token timing-safe
    const authHeader = req.headers['authorization'] ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!this.verifyToken(token)) {
      this.respondJson(res, 401, { error: 'unauthorized' })
      return
    }

    if (req.url === '/sync' && req.method === 'POST') {
      this.emit({ type: 'connected' })
      this.handleSync(req, res)
      return
    }

    res.writeHead(404); res.end()
  }

  private verifyToken(token: string): boolean {
    if (!this.sessionKey) return false
    const expected = this.sessionKey.toString('base64')
    const tokBuf = Buffer.from(token)
    const expBuf = Buffer.from(expected)
    return tokBuf.length === expBuf.length && timingSafeEqual(tokBuf, expBuf)
  }

  private async handleSync(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readBody(req)
      const env = JSON.parse(body) as { data: string; v: number }
      if (!env.data) throw new Error('payload sin data')

      // Descifrar payload entrante con la session key
      const plain = this.crypto.decryptWithKey(env.data, this.sessionKey!)
      const incoming = JSON.parse(plain) as SyncStatePayload

      // Delegar al orchestrator que hace el merge + aplica a la DB del desktop
      const merged = this.mergeHandler!(incoming)

      // Cifrar respuesta con la misma session key
      const responseEncrypted = this.crypto.encryptWithKey(JSON.stringify(merged), this.sessionKey!)
      this.respondJson(res, 200, { data: responseEncrypted, v: 1 })

      if (merged.stats) this.emit({ type: 'merged', stats: merged.stats })

      // Una sola sincronización por sesión — apagamos tras responder
      setTimeout(() => this.stop(), 500)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error'
      this.respondJson(res, 400, { error: msg })
      this.emit({ type: 'error', message: msg })
    }
  }

  private respondJson(res: ServerResponse, status: number, body: object): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  async stop(): Promise<void> {
    if (this.sessionKey) { this.sessionKey.fill(0); this.sessionKey = null }
    this.mergeHandler = undefined
    await new Promise<void>(resolve => {
      if (!this.server) { resolve(); return }
      this.server.close(() => { this.server = null; resolve() })
    })
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
