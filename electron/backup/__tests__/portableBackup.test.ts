import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildBackup, openBackup, WrongBackupPasswordError, type PortableState } from '../portableBackup'

// fixture_v1.nubeless es el vector de interop: el móvil
// (test/features/backup/portable_backup_test.dart) abre este MISMO archivo.
const FIXTURE = readFileSync(join(__dirname, 'fixture_v1.nubeless'), 'utf8')
const FIXTURE_PASSWORD = 'respaldo-de-prueba'

describe('respaldo portátil .nubeless', () => {
  test('abre el vector de interop', () => {
    const s = openBackup(FIXTURE, FIXTURE_PASSWORD)
    expect(s.accounts).toHaveLength(1)
    expect(s.accounts[0]).toMatchObject({
      platform: 'GitHub', password: 'Clave#Prueba2026', totp_secret: 'JBSWY3DPEHPK3PXP', notes: 'nota ñ ✓',
    })
    expect(s.categories[0].name).toBe('Trabajo')
  })

  test('contraseña incorrecta → WrongBackupPasswordError', () => {
    expect(() => openBackup(FIXTURE, 'otra-contrasena')).toThrow(WrongBackupPasswordError)
  })

  test('ida y vuelta con salt/iv aleatorios', () => {
    const state: PortableState = { accounts: [], categories: [], v: 1 }
    const f = buildBackup(state, 'una-clave-larga')
    expect(openBackup(JSON.stringify(f), 'una-clave-larga')).toEqual(state)
  })

  test('rechaza archivos que no son respaldo y contraseñas cortas', () => {
    expect(() => openBackup('{"hola":1}', 'x')).toThrow(/no es un respaldo/)
    expect(() => buildBackup({ accounts: [], categories: [], v: 1 }, 'corta')).toThrow(/al menos 8/)
  })
})
