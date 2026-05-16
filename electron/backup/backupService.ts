import {
  existsSync, mkdirSync, readdirSync, statSync,
  writeFileSync, readFileSync, unlinkSync, copyFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { CryptoService } from '../crypto/cryptoService'
import { getAllAccountsRaw, insertAccountRaw, type AccountRow } from '../db/accountRepo'
import { getDb } from '../db/database'

export interface BackupMeta {
  /** Nombre del archivo (sin ruta) — ej. "vault-2026-05-09T22-15-04.enc" */
  fileName: string
  /** Ruta absoluta */
  fullPath: string
  /** Timestamp de creación (ms epoch) */
  createdAt: number
  /** Tamaño en bytes */
  size: number
}

interface BackupPayload {
  version: number
  exportedAt: string
  accounts: AccountRow[]
}

/** Máximo de backups que se conservan — los más viejos se eliminan al rotar. */
export const MAX_BACKUPS = 10

/**
 * Gestiona la carpeta `{userData}/backups/`:
 *   - Crea backups cifrados del vault con timestamp en el nombre.
 *   - Lista los backups existentes ordenados del más reciente al más viejo.
 *   - Restaura desde un backup (reemplaza el contenido del vault actual).
 *   - Rota: mantiene solo los MAX_BACKUPS más recientes.
 *
 * Reutiliza `cryptoService.encryptVaultData / decryptVaultData`, que dependen
 * de que el vault esté desbloqueado (clave maestra en memoria).
 */
export class BackupService {
  private readonly dir: string

  constructor(
    private readonly crypto: CryptoService,
    private readonly userDataPath: string
  ) {
    this.dir = join(userDataPath, 'backups')
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
  }

  /** Ruta absoluta de la carpeta — útil para "abrir en Finder/Explorer". */
  get folderPath(): string {
    return this.dir
  }

  /** Crea un backup nuevo y aplica rotación. Devuelve la metadata del archivo creado. */
  create(): BackupMeta {
    if (!this.crypto.isUnlocked()) throw new Error('Vault locked')

    const accounts = getAllAccountsRaw()
    const payload: BackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts
    }
    const encrypted = this.crypto.encryptVaultData(JSON.stringify(payload))

    // Nombre: vault-2026-05-09T22-15-04.enc  (timestamp seguro para filesystems)
    const stamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
    const fileName = `vault-${stamp}.enc`
    const fullPath = join(this.dir, fileName)
    writeFileSync(fullPath, encrypted)

    this.rotate()

    const s = statSync(fullPath)
    return { fileName, fullPath, createdAt: s.mtimeMs, size: s.size }
  }

  /** Lista los backups existentes, del más reciente al más viejo. */
  list(): BackupMeta[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter(f => f.startsWith('vault-') && f.endsWith('.enc'))
      .map(fileName => {
        const fullPath = join(this.dir, fileName)
        const s = statSync(fullPath)
        return { fileName, fullPath, createdAt: s.mtimeMs, size: s.size }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Restaura desde un backup. Antes de tocar la DB hace una copia de seguridad
   * del estado actual para poder rollback manual si algo sale mal.
   * Devuelve el número de cuentas restauradas.
   */
  restore(fileName: string): number {
    if (!this.crypto.isUnlocked()) throw new Error('Vault locked')
    const fullPath = this.safePath(fileName)
    if (!existsSync(fullPath)) throw new Error('Backup no encontrado')

    // Backup defensivo de la DB actual por si algo falla durante la restauración
    const dbPath = join(this.userDataPath, 'passwords.db')
    const safetyBak = join(this.userDataPath, `passwords_pre_restore_${Date.now()}.bak`)
    if (existsSync(dbPath)) copyFileSync(dbPath, safetyBak)

    const raw = readFileSync(fullPath)
    const json = this.crypto.decryptVaultData(raw)
    const payload = JSON.parse(json) as BackupPayload

    const db = getDb()
    db.prepare('DELETE FROM accounts').run()
    const insert = db.transaction((rows: AccountRow[]) => {
      for (const row of rows) {
        insertAccountRaw({
          // Si el backup viene de una versión anterior sin uuid, se genera uno.
          uuid: row.uuid ?? '',
          platform: row.platform,
          username: row.username,
          password: row.password,
          category_id: row.category_id,
          is_favorite: row.is_favorite,
          notes: row.notes,
          url: row.url,
          totp_secret: row.totp_secret ?? '',
          created_at: row.created_at,
          updated_at: row.updated_at,
          deleted_at: row.deleted_at ?? null
        })
      }
    })
    insert(payload.accounts)
    return payload.accounts.length
  }

  /** Elimina un backup específico. */
  delete(fileName: string): void {
    const fullPath = this.safePath(fileName)
    if (existsSync(fullPath)) unlinkSync(fullPath)
  }

  /** Mantiene solo los MAX_BACKUPS más recientes. */
  private rotate(): void {
    const all = this.list()
    if (all.length <= MAX_BACKUPS) return
    for (const old of all.slice(MAX_BACKUPS)) {
      try { unlinkSync(old.fullPath) } catch { /* ignore */ }
    }
  }

  /**
   * Resuelve y valida que el nombre del archivo no escape de la carpeta de backups
   * (defensa contra path traversal: "../../etc/passwd").
   */
  private safePath(fileName: string): string {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new Error('Nombre de archivo inválido')
    }
    return join(this.dir, fileName)
  }
}
