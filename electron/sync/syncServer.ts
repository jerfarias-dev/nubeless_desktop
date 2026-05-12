import { createServer, type Server } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import type { CryptoService } from '../crypto/cryptoService'

const SESSION_TTL_MS = 120_000 // 2 minutos

export interface SyncSession {
  qrData: string    // base64 del payload QR (scheme pmvault://<base64json>)
  expiresAt: number
  ip: string
  port: number
}

export type SyncEvent =
  | { type: 'connected' }
  | { type: 'transferred'; count: number }
  | { type: 'expired' }
  | { type: 'error'; message: string }

export class SyncServer {
  private server: Server | null = null
  private sessionKey: Buffer | null = null
  private expiresAt = 0
  private onEvent?: (e: SyncEvent) => void

  constructor(private readonly crypto: CryptoService) {}

  setEventListener(fn: (e: SyncEvent) => void) {
    this.onEvent = fn
  }

  private emit(e: SyncEvent) {
    this.onEvent?.(e)
  }

  private getLocalIP(): string {
    const nets = networkInterfaces()
    for (const ifaces of Object.values(nets)) {
      for (const iface of ifaces ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address
      }
    }
    return '127.0.0.1'
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

  async start(vaultJson: string): Promise<SyncSession> {
    await this.stop()

    this.sessionKey = randomBytes(32)
    this.expiresAt  = Date.now() + SESSION_TTL_MS

    const port = await this.findFreePort()
    const ip   = this.getLocalIP()

    // Cifrar el vault con la session key ANTES de que llegue la petición
    const encryptedVault = this.crypto.encryptWithKey(vaultJson, this.sessionKey)

    const qrPayload = JSON.stringify({
      ip,
      port,
      key: this.sessionKey.toString('base64'),
      exp: this.expiresAt,
      v: 1
    })
    const qrData = `pmvault://${Buffer.from(qrPayload).toString('base64')}`

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        // CORS para React Native fetch
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Authorization')

        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

        // Verificar expiración
        if (Date.now() > this.expiresAt) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'expired' }))
          this.emit({ type: 'expired' })
          return
        }

        // Verificar token (timing-safe)
        const authHeader = req.headers['authorization'] ?? ''
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
        const expected = this.sessionKey!.toString('base64')
        const tokBuf = Buffer.from(token)
        const expBuf = Buffer.from(expected)
        const validToken =
          tokBuf.length === expBuf.length &&
          timingSafeEqual(tokBuf, expBuf)

        if (!validToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }

        if (req.url === '/vault' && req.method === 'GET') {
          this.emit({ type: 'connected' })
          // Contar cuentas del payload (sin descifrarlo de nuevo)
          let count = 0
          try {
            const parsed = JSON.parse(this.crypto.decryptWithKey(encryptedVault, this.sessionKey!))
            count = (parsed as { accounts: unknown[] }).accounts?.length ?? 0
          } catch { /* ignore */ }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ data: encryptedVault, v: 1 }))
          this.emit({ type: 'transferred', count })
          // Servidor muere tras transferencia exitosa
          setTimeout(() => this.stop(), 500)
          return
        }

        res.writeHead(404); res.end()
      })

      this.server.once('error', reject)

      this.server.listen(port, '0.0.0.0', () => {
        // Auto-expirar
        setTimeout(() => {
          this.emit({ type: 'expired' })
          this.stop()
        }, SESSION_TTL_MS)

        resolve({ qrData, expiresAt: this.expiresAt, ip, port })
      })
    })
  }

  async stop(): Promise<void> {
    if (this.sessionKey) { this.sessionKey.fill(0); this.sessionKey = null }
    await new Promise<void>(resolve => {
      if (!this.server) { resolve(); return }
      this.server.close(() => { this.server = null; resolve() })
    })
  }
}
