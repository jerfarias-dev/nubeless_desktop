import { describe, test, expect } from 'vitest'
import { parseCSV, parseImportFile, extractTotpSecret, platformFromUrl } from '../importers'

describe('parseCSV', () => {
  test('comillas, comillas escapadas, saltos de línea dentro y CRLF', () => {
    const rows = parseCSV('﻿a,b,c\r\n"x,1","dice ""hola""","linea1\nlinea2"\r\n')
    expect(rows).toEqual([['a', 'b', 'c'], ['x,1', 'dice "hola"', 'linea1\nlinea2']])
  })
})

describe('utilidades', () => {
  test('extractTotpSecret desde otpauth y base32 con espacios', () => {
    expect(extractTotpSecret('otpauth://totp/GitHub:yo?secret=jbswy3dpehpk3pxp&issuer=GitHub')).toBe('JBSWY3DPEHPK3PXP')
    expect(extractTotpSecret('jbsw y3dp-ehpk 3pxp')).toBe('JBSWY3DPEHPK3PXP')
    expect(extractTotpSecret('')).toBe('')
  })
  test('platformFromUrl', () => {
    expect(platformFromUrl('https://www.github.com/login')).toBe('github.com')
    expect(platformFromUrl('accounts.google.com')).toBe('accounts.google.com')
  })
})

describe('parseImportFile', () => {
  test('Bitwarden JSON: logins con carpeta y TOTP; omite notas y tarjetas', () => {
    const json = JSON.stringify({
      encrypted: false,
      folders: [{ id: 'f1', name: 'Trabajo' }],
      items: [
        { type: 1, name: 'GitHub', folderId: 'f1', favorite: true, notes: 'n',
          login: { username: 'yo', password: 'p1', totp: 'otpauth://totp/x?secret=ABC', uris: [{ uri: 'https://github.com' }] } },
        { type: 2, name: 'Nota segura' },
        { type: 3, name: 'Visa' },
      ],
    })
    const r = parseImportFile(json)
    expect(r.format).toBe('bitwarden-json')
    expect(r.skipped).toBe(2)
    expect(r.entries).toEqual([{
      platform: 'GitHub', username: 'yo', password: 'p1', url: 'https://github.com',
      notes: 'n', totp: 'ABC', category: 'Trabajo', favorite: true,
    }])
  })

  test('Bitwarden JSON cifrado da error claro', () => {
    expect(() => parseImportFile('{"encrypted":true,"items":[]}')).toThrow(/cifrado/)
  })

  test('Bitwarden CSV', () => {
    const csv = 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
      'Correo,1,login,Gmail,,,0,https://mail.google.com,yo@gmail.com,secreta,\n' +
      ',,note,Nota,texto,,0,,,,\n'
    const r = parseImportFile(csv)
    expect(r.format).toBe('bitwarden-csv')
    expect(r.skipped).toBe(1)
    expect(r.entries[0]).toMatchObject({ platform: 'Gmail', username: 'yo@gmail.com', password: 'secreta', category: 'Correo', favorite: true })
  })

  test('Chrome / Edge', () => {
    const r = parseImportFile('name,url,username,password,note\nGitHub,https://github.com/,yo,clave,mi nota\n')
    expect(r.format).toBe('chrome-csv')
    expect(r.entries[0]).toMatchObject({ platform: 'GitHub', url: 'https://github.com/', username: 'yo', password: 'clave', notes: 'mi nota' })
  })

  test('Firefox: sin título, usa el dominio', () => {
    const csv = '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"\n' +
      '"https://www.amazon.com","yo","clave","","https://www.amazon.com","{1}","1","1","1"\n'
    const r = parseImportFile(csv)
    expect(r.format).toBe('firefox-csv')
    expect(r.entries[0]).toMatchObject({ platform: 'amazon.com', username: 'yo', password: 'clave' })
  })

  test('KeePassXC', () => {
    const csv = '"Group","Title","Username","Password","URL","Notes","TOTP","Icon","Last Modified","Created"\n' +
      '"Root/Banco","BBVA","cliente1","pin123","https://bbva.mx","","otpauth://totp/a?secret=XYZ","0","",""\n'
    const r = parseImportFile(csv)
    expect(r.format).toBe('keepass-csv')
    expect(r.entries[0]).toMatchObject({ platform: 'BBVA', category: 'Root/Banco', totp: 'XYZ' })
  })

  test('1Password 8', () => {
    const csv = 'Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\n' +
      'Netflix,https://netflix.com,yo,clave,,true,false,,\n'
    const r = parseImportFile(csv)
    expect(r.format).toBe('1password-csv')
    expect(r.entries[0]).toMatchObject({ platform: 'Netflix', favorite: true })
  })

  test('CSV de Nubeless (export propio): omite contraseñas ocultas', () => {
    const csv = 'Platform,Username,Password,Category,URL,Favorite,Notes\n' +
      'GitHub,yo,clave,Trabajo,https://github.com,yes,\n' +
      'Oculta,yo,***,,,no,\n'
    const r = parseImportFile(csv)
    expect(r.format).toBe('nubeless-csv')
    expect(r.skipped).toBe(1)
    expect(r.entries[0]).toMatchObject({ platform: 'GitHub', category: 'Trabajo', favorite: true })
  })

  test('sin columna de contraseña da error', () => {
    expect(() => parseImportFile('a,b\n1,2\n')).toThrow(/contraseña/)
  })
})
