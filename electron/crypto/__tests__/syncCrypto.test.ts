import { describe, test, expect, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CryptoService } from '../cryptoService'

/**
 * Interoperabilidad del sync: estas aserciones deben permanecer idénticas a las
 * de la app móvil (test/core/crypto/crypto_service_test.dart). El "vector de
 * oro" HKDF garantiza que ambos lados derivan exactamente la misma Kenc desde
 * el mismo secreto K del QR; si cambia el salt/info o el algoritmo, el sync se
 * rompe en silencio y este test lo detecta.
 */
describe('CryptoService — derivación e interop del sync', () => {
  let crypto: CryptoService

  beforeEach(() => {
    // Los métodos de sync no tocan disco; el tmpdir es solo para el constructor.
    crypto = new CryptoService(mkdtempSync(join(tmpdir(), 'pm-sync-test-')))
  })

  test('deriveSyncKey — vector de oro compartido con el móvil', () => {
    // K = 32 bytes de 0x01
    const K = Buffer.alloc(32, 1)
    const Kenc = crypto.deriveSyncKey(K)
    expect(Kenc.toString('hex')).toBe(
      '7ca635126249f59adb7662f9c4057f5b6f68bb6982870d45d8d2689d5e4e1016'
    )
  })

  test('deriveSyncKey es determinista y de 32 bytes', () => {
    const K = randomBytes(32)
    const a = crypto.deriveSyncKey(K)
    const b = crypto.deriveSyncKey(K)
    expect(a.length).toBe(32)
    expect(a.equals(b)).toBe(true)
  })

  test('K distinta → Kenc distinta', () => {
    const a = crypto.deriveSyncKey(Buffer.alloc(32, 1))
    const b = crypto.deriveSyncKey(Buffer.alloc(32, 2))
    expect(a.equals(b)).toBe(false)
  })

  test('roundtrip encrypt/decrypt con la clave derivada', () => {
    const key = crypto.deriveSyncKey(randomBytes(32))
    const plain = JSON.stringify({ accounts: [], categories: [], ts: Date.now() })
    const packed = crypto.encryptWithKey(plain, key)
    expect(packed).not.toBe(plain)
    expect(crypto.decryptWithKey(packed, key)).toBe(plain)
  })

  test('descifra el ciphertext de oro producido por node:crypto (formato iv|tag|ct)', () => {
    // Cifrado con Kenc(K=0x01*32), iv=0x02*12, plaintext='hola-homevault'.
    // El mismo literal se verifica del lado móvil para probar interop bidireccional.
    const key = crypto.deriveSyncKey(Buffer.alloc(32, 1))
    const packed = 'AgICAgICAgICAgICKW0nFMebG23jMxcT9jo00DNjAe6CrxId5MpAiCPH'
    expect(crypto.decryptWithKey(packed, key)).toBe('hola-homevault')
  })

  test('un tag GCM inválido (clave equivocada) lanza — es la puerta de auth', () => {
    const good = crypto.deriveSyncKey(Buffer.alloc(32, 1))
    const bad = crypto.deriveSyncKey(Buffer.alloc(32, 9))
    const packed = crypto.encryptWithKey('secreto', good)
    expect(() => crypto.decryptWithKey(packed, bad)).toThrow()
  })
})
