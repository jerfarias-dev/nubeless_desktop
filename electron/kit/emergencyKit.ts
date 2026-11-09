import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'

/**
 * Kit de emergencia: PDF imprimible con instrucciones de recuperación.
 * NO contiene contraseñas ni datos de la bóveda — solo dónde están los datos,
 * cómo restaurarlos y un recuadro para escribir a mano la contraseña maestra.
 */

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

export function emergencyKitHtml(opts: { dataPath: string; version: string; date: string; platform: string }): string {
  const os = opts.platform === 'darwin' ? 'macOS' : opts.platform === 'win32' ? 'Windows' : 'Linux'
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Kit de emergencia — Nubeless</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 22pt; margin: 0 0 2mm; } h2 { font-size: 13pt; margin: 7mm 0 2mm; border-bottom: 1px solid #ccc; padding-bottom: 1mm; }
  .sub { color: #555; margin: 0 0 6mm; }
  .box { border: 2px solid #111; border-radius: 3mm; padding: 4mm 5mm; margin: 3mm 0; }
  .line { border-bottom: 1px solid #999; height: 9mm; }
  .warn { background: #fff4e5; border: 1px solid #f0b46b; border-radius: 2mm; padding: 3mm 4mm; }
  code { font-family: Menlo, Consolas, monospace; font-size: 9.5pt; background: #f2f2f2; padding: 0.5mm 1.5mm; border-radius: 1mm; word-break: break-all; }
  ol { padding-left: 6mm; } li { margin: 1mm 0; } .small { color: #666; font-size: 9pt; }
</style></head><body>
  <h1>Kit de emergencia de Nubeless</h1>
  <p class="sub">Generado el ${esc(opts.date)} · Nubeless ${esc(opts.version)} · ${esc(os)}</p>

  <div class="warn"><b>Guárdalo en un lugar seguro y físico</b> (una caja fuerte, con tus documentos importantes)
  o entrégalo a una persona de confianza. Quien tenga esta hoja <b>y</b> tu equipo o un respaldo puede abrir tu bóveda.</div>

  <h2>1. Tu contraseña maestra</h2>
  <p>Escríbela a mano. Nubeless no la guarda en ningún lado: si la olvidas, nadie puede recuperar tus datos.</p>
  <div class="box"><div class="line"></div><div class="line"></div></div>
  <p>Contraseña de tus respaldos <code>.nubeless</code> (si usas una distinta):</p>
  <div class="box"><div class="line"></div></div>

  <h2>2. Dónde están tus datos</h2>
  <p>Nubeless no usa la nube: todo vive cifrado en tus dispositivos.</p>
  <ul>
    <li><b>Este equipo (${esc(os)}):</b> <code>${esc(opts.dataPath)}</code><br>
      Archivos <code>passwords.db</code>, <code>salt</code> y <code>verify</code>, más la carpeta de copias automáticas.</li>
    <li><b>App móvil:</b> dentro del almacenamiento privado de la app (no accesible desde otras apps).</li>
    <li><b>Respaldos <code>.nubeless</code>:</b> donde los hayas guardado. Anota aquí dónde:</li>
  </ul>
  <div class="box"><div class="line"></div><div class="line"></div></div>

  <h2>3. Cómo recuperar el acceso</h2>
  <ol>
    <li>Instala Nubeless: en Windows desde la Microsoft Store, en macOS desde la página de descargas
      (<code>nubeless.vercel.app</code>), en Android desde Google Play.</li>
    <li>Si tienes un respaldo <code>.nubeless</code>: crea una bóveda nueva y usa <b>Bóveda → Importar respaldo</b>
      con la contraseña del respaldo.</li>
    <li>Si conservas el teléfono con Nubeless: crea una bóveda en el equipo nuevo y sincroniza con el QR
      (<b>Sincronizar móvil</b>). Las cuentas del teléfono pasan al equipo.</li>
    <li>Si conservas el disco del equipo: copia la carpeta de datos del punto 2 a la misma ruta en el equipo nuevo
      antes de abrir Nubeless, y entra con tu contraseña maestra.</li>
  </ol>

  <h2>4. Recomendaciones</h2>
  <ul>
    <li>Exporta un respaldo <code>.nubeless</code> cada mes y guárdalo en una memoria USB.</li>
    <li>Mantén Nubeless en al menos dos dispositivos sincronizados.</li>
    <li>Actualiza este kit si cambias tu contraseña maestra.</li>
  </ul>
  <p class="small">Este documento no contiene ninguna contraseña ni dato de tu bóveda.</p>
</body></html>`
}

export async function exportEmergencyKit(targetPath: string): Promise<void> {
  const html = emergencyKitHtml({
    dataPath: app.getPath('userData'),
    version: app.getVersion(),
    date: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
    platform: process.platform,
  })
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
    writeFileSync(targetPath, pdf)
  } finally {
    win.destroy()
  }
}
