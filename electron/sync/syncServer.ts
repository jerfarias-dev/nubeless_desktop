import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { randomBytes } from 'node:crypto'
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
  /** Secreto de sesión K — se embebe en el QR (canal óptico) y NUNCA viaja por red. */
  private sessionKey: Buffer | null = null
  /** Clave de cifrado derivada Kenc = HKDF(K). Es la que realmente cifra el cuerpo. */
  private encKey: Buffer | null = null
  /** Una sola sincronización exitosa por sesión — bloquea replays dentro de la ventana. */
  private consumed = false
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
    this.encKey       = this.crypto.deriveSyncKey(this.sessionKey)
    this.consumed     = false
    this.expiresAt    = Date.now() + SESSION_TTL_MS

    const port = await this.findFreePort()
    const ips  = this.getAllLocalIPs()
    const primaryIp = ips[0]

    // QR v3: incluye `ips` (todas las interfaces) y `ip` (primaria). El campo
    // `key` es el secreto de sesión K, que viaja SOLO por el QR (óptico). El
    // móvil deriva Kenc = HKDF(K) igual que el desktop y cifra con ella; la
    // clave nunca se manda por HTTP (a diferencia de v2, que la reenviaba como
    // bearer token en claro).
    const qrPayload = JSON.stringify({
      ip: primaryIp,        // fallback para diagnóstico
      ips,                  // móvil probará cada una
      port,
      key: this.sessionKey.toString('base64'),
      exp: this.expiresAt,
      v: 3
    })
    const qrData = `pmvault://${Buffer.from(qrPayload).toString('base64')}`

    // K ya quedó embebido en qrData (canal óptico) y no vuelve a usarse en
    // memoria: cifrado y auth usan encKey = HKDF(K). Borramos la Buffer de K
    // para minimizar la vida del secreto en el proceso.
    this.sessionKey.fill(0)
    this.sessionKey = null

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
    // CORS — el móvil hace fetch sin credenciales (ya no se envía Authorization)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    // TTL
    if (Date.now() > this.expiresAt) {
      this.respondJson(res, 401, { error: 'expired' })
      this.emit({ type: 'expired' })
      return
    }

    // Ya NO hay bearer token: la autenticación es implícita en el descifrado
    // AES-GCM del cuerpo (solo quien posee K puede producir un tag válido).
    if (req.url === '/sync' && req.method === 'POST') {
      this.handleSync(req, res)
      return
    }

    res.writeHead(404); res.end()
  }

  private async handleSync(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readBody(req)
      const env = JSON.parse(body) as { data: string; v?: number }
      if (env.v !== 3) throw new Error('versión de protocolo no soportada (se requiere v3)')
      if (!env.data) throw new Error('payload sin data')

      // Sesión ya cerrada (p.ej. race con stop()): tratar como expirada.
      const encKey = this.encKey
      if (!encKey) {
        this.respondJson(res, 401, { error: 'expired' })
        return
      }

      // Autenticación = descifrado exitoso. Si el tag GCM no valida, el emisor
      // no posee K → 401. Envolvemos SOLO el descifrado para distinguir
      // "no autorizado" de un error de merge posterior.
      let plain: string
      try {
        plain = this.crypto.decryptWithKey(env.data, encKey)
      } catch {
        this.respondJson(res, 401, { error: 'unauthorized' })
        return
      }

      const incoming = JSON.parse(plain) as SyncStatePayload & { ts?: number }

      // Frescura: rechaza payloads con timestamp fuera de la ventana de sesión
      // (defensa anti-replay adicional al TTL y al single-use).
      if (typeof incoming.ts === 'number' && Math.abs(Date.now() - incoming.ts) > SESSION_TTL_MS) {
        this.respondJson(res, 401, { error: 'stale' })
        return
      }

      // Single-use: una sola sincronización válida por sesión.
      if (this.consumed) {
        this.respondJson(res, 409, { error: 'session already consumed' })
        return
      }
      this.emit({ type: 'connected' })

      // Delegar al orchestrator que hace el merge + aplica a la DB del desktop.
      // El merge es SÍNCRONO (better-sqlite3), así que no hay ventana de
      // concurrencia entre este punto y marcar `consumed`.
      const merged = this.mergeHandler!(incoming)

      // Marcamos consumida SOLO tras un merge exitoso: si `mergeHandler` lanza,
      // la sesión sigue viva y el cliente puede reintentar dentro del TTL.
      this.consumed = true

      // Cifrar respuesta con la misma clave derivada + timestamp de servidor.
      const responseEncrypted = this.crypto.encryptWithKey(
        JSON.stringify({ ...merged, ts: Date.now() }),
        encKey
      )
      this.respondJson(res, 200, { data: responseEncrypted, v: 3 })

      if (merged.stats) this.emit({ type: 'merged', stats: merged.stats })

      // Apagamos tras responder
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
    // Invalidar la sesión ANTES de liberar claves y cerrar el server: si entra
    // una request mientras el server aún acepta conexiones, el chequeo de TTL
    // en handleRequest la rechaza con 401 en vez de tocar claves ya liberadas.
    this.expiresAt = 0
    if (this.sessionKey) { this.sessionKey.fill(0); this.sessionKey = null }
    if (this.encKey) { this.encKey.fill(0); this.encKey = null }
    this.consumed = false
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
