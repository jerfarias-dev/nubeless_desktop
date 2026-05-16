import { describe, test, expect } from 'vitest'
import { mergeByUuid, combineStats, emptyStats } from '../mergeService'

// Helpers para crear registros de prueba con la forma mínima requerida
type TestRec = { uuid: string; updated_at: string; deleted_at: string | null; data?: string }

const rec = (uuid: string, updatedAt: string, deletedAt: string | null = null, data = ''): TestRec => ({
  uuid, updated_at: updatedAt, deleted_at: deletedAt, data,
})

const T_EARLY = '2026-05-01T10:00:00.000Z'
const T_MID   = '2026-05-10T10:00:00.000Z'
const T_LATE  = '2026-05-15T10:00:00.000Z'

describe('mergeByUuid — casos básicos', () => {
  test('local vacío → todo lo de remote se pulled (added)', () => {
    const remote = [rec('a', T_MID), rec('b', T_MID)]
    const r = mergeByUuid<TestRec>([], remote)

    expect(r.merged.length).toBe(2)
    expect(r.toApplyLocally.length).toBe(2)
    expect(r.stats.pulled.added).toBe(2)
    expect(r.stats.pushed.added).toBe(0)
  })

  test('remote vacío → todo lo de local se pushed (added)', () => {
    const local = [rec('a', T_MID), rec('b', T_MID)]
    const r = mergeByUuid<TestRec>(local, [])

    expect(r.merged.length).toBe(2)
    expect(r.toApplyLocally.length).toBe(0)        // local no aplica nada nuevo
    expect(r.stats.pushed.added).toBe(2)
    expect(r.stats.pulled.added).toBe(0)
  })

  test('mismo registro idéntico en ambos → sin cambios', () => {
    const a1 = rec('a', T_MID, null, 'x')
    const a2 = rec('a', T_MID, null, 'x')
    const r = mergeByUuid<TestRec>([a1], [a2])

    expect(r.merged.length).toBe(1)
    expect(r.toApplyLocally.length).toBe(0)
    expect(r.stats.pulled.added).toBe(0)
    expect(r.stats.pulled.updated).toBe(0)
    expect(r.stats.pushed.added).toBe(0)
    expect(r.stats.pushed.updated).toBe(0)
  })
})

describe('mergeByUuid — LWW por timestamp', () => {
  test('remote más nuevo → local adopta (pulled.updated)', () => {
    const local  = [rec('a', T_EARLY, null, 'old')]
    const remote = [rec('a', T_LATE,  null, 'new')]
    const r = mergeByUuid<TestRec>(local, remote)

    expect(r.merged[0].data).toBe('new')
    expect(r.toApplyLocally[0].data).toBe('new')
    expect(r.stats.pulled.updated).toBe(1)
    expect(r.stats.pushed.updated).toBe(0)
  })

  test('local más nuevo → local prevalece (pushed.updated)', () => {
    const local  = [rec('a', T_LATE,  null, 'new')]
    const remote = [rec('a', T_EARLY, null, 'old')]
    const r = mergeByUuid<TestRec>(local, remote)

    expect(r.merged[0].data).toBe('new')
    expect(r.toApplyLocally.length).toBe(0)
    expect(r.stats.pushed.updated).toBe(1)
  })

  test('empate de timestamps → gana local (decisión arbitraria estable)', () => {
    const local  = [rec('a', T_MID, null, 'localValue')]
    const remote = [rec('a', T_MID, null, 'remoteValue')]
    const r = mergeByUuid<TestRec>(local, remote)

    expect(r.merged[0].data).toBe('localValue')
    expect(r.toApplyLocally.length).toBe(0)
  })
})

describe('mergeByUuid — tombstones (borrados)', () => {
  test('local vivo + remote tombstone más nuevo → local borra (pulled.deleted)', () => {
    const local  = [rec('a', T_EARLY)]
    const remote = [rec('a', T_LATE, T_LATE)]   // tombstone
    const r = mergeByUuid<TestRec>(local, remote)

    expect(r.merged[0].deleted_at).toBe(T_LATE)
    expect(r.toApplyLocally[0].deleted_at).toBe(T_LATE)
    expect(r.stats.pulled.deleted).toBe(1)
    expect(r.stats.pulled.updated).toBe(0)
  })

  test('local tombstone + remote vivo más viejo → local prevalece (pushed.deleted)', () => {
    const local  = [rec('a', T_LATE, T_LATE)]   // tombstone
    const remote = [rec('a', T_EARLY)]
    const r = mergeByUuid<TestRec>(local, remote)

    expect(r.merged[0].deleted_at).toBe(T_LATE)
    expect(r.toApplyLocally.length).toBe(0)
    expect(r.stats.pushed.deleted).toBe(1)
  })

  test('tombstone solo en remote (local no lo tenía) → no cuenta como delete', () => {
    // El "borrado" no es visible para local porque nunca tuvo el record vivo.
    // Pero igual se aplica para propagar en futuros syncs.
    const r = mergeByUuid<TestRec>([], [rec('a', T_MID, T_MID)])

    expect(r.merged.length).toBe(1)
    expect(r.toApplyLocally.length).toBe(1)
    expect(r.stats.pulled.deleted).toBe(0)  // no era visible
    expect(r.stats.pulled.added).toBe(0)    // no es alive
  })

  test('ambos tombstones (mismo o distintos timestamps) → sin cambio user-visible', () => {
    const local  = [rec('a', T_EARLY, T_EARLY)]
    const remote = [rec('a', T_LATE,  T_LATE)]
    const r = mergeByUuid<TestRec>(local, remote)

    // Remote es más nuevo, se adopta — pero los stats no incrementan porque
    // ya estaba muerto en local también.
    expect(r.merged[0].deleted_at).toBe(T_LATE)
    expect(r.stats.pulled.deleted).toBe(0)
    expect(r.stats.pushed.deleted).toBe(0)
  })

  test('"undelete" — local tombstone, remote vivo más nuevo → revivir (pulled.added)', () => {
    const local  = [rec('a', T_EARLY, T_EARLY)]
    const remote = [rec('a', T_LATE)]
    const r = mergeByUuid<TestRec>(local, remote)

    expect(r.merged[0].deleted_at).toBeNull()
    expect(r.stats.pulled.added).toBe(1)
  })
})

describe('mergeByUuid — casos mixtos', () => {
  test('mix complejo: nuevos en ambos, updates en ambas direcciones, deletes', () => {
    const local = [
      rec('a', T_LATE,  null, 'localUpdatedA'),  // ganará
      rec('b', T_EARLY, null, 'localOldB'),      // perderá ante remote
      rec('c', T_MID),                            // solo local → push.added
      rec('d', T_LATE, T_LATE),                  // tombstone local sin remote → propaga pero no cuenta
    ]
    const remote = [
      rec('a', T_EARLY, null, 'remoteOldA'),     // local más nuevo
      rec('b', T_LATE,  null, 'remoteNewB'),     // remote más nuevo → pull update
      rec('e', T_MID),                            // solo remote → pull.added
      rec('f', T_LATE, T_LATE),                  // tombstone remote sin local → propaga pero no cuenta
    ]
    const r = mergeByUuid<TestRec>(local, remote)

    expect(r.merged.length).toBe(6)  // a, b, c, d, e, f (incluye tombstones)
    // Stats — tombstones que el otro lado NUNCA tuvo no cuentan en stats
    // (no son cambios "visibles al usuario"), aunque sí se propagan en merged.
    expect(r.stats.pulled.added).toBe(1)    // e
    expect(r.stats.pulled.updated).toBe(1)  // b
    expect(r.stats.pulled.deleted).toBe(0)  // f no cuenta (local nunca lo tuvo)
    expect(r.stats.pushed.added).toBe(1)    // c
    expect(r.stats.pushed.updated).toBe(1)  // a
    expect(r.stats.pushed.deleted).toBe(0)  // d no cuenta (remote nunca lo tuvo)
  })

  test('delete real que SÍ cuenta: ambos lados tenían el registro vivo', () => {
    // Este es el caso "user borra en desktop, mobile aún tiene la versión viva".
    // ESE delete sí debe contarse porque mobile va a perder un registro visible.
    const local  = [rec('a', T_LATE, T_LATE)]   // tombstone reciente local
    const remote = [rec('a', T_EARLY)]          // remote tiene vivo (vieja)
    const r = mergeByUuid<TestRec>(local, remote)
    expect(r.stats.pushed.deleted).toBe(1)      // SÍ cuenta
  })
})

describe('combineStats / emptyStats', () => {
  test('emptyStats tiene todos los contadores en 0', () => {
    const s = emptyStats()
    expect(s.pulled.added + s.pulled.updated + s.pulled.deleted).toBe(0)
    expect(s.pushed.added + s.pushed.updated + s.pushed.deleted).toBe(0)
  })

  test('combineStats suma por campo', () => {
    const a = { pulled: { added: 1, updated: 2, deleted: 3 }, pushed: { added: 4, updated: 5, deleted: 6 } }
    const b = { pulled: { added: 10, updated: 20, deleted: 30 }, pushed: { added: 40, updated: 50, deleted: 60 } }
    const c = combineStats(a, b)
    expect(c.pulled).toEqual({ added: 11, updated: 22, deleted: 33 })
    expect(c.pushed).toEqual({ added: 44, updated: 55, deleted: 66 })
  })
})
