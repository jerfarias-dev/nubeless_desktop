// afterPack de electron-builder: firma ad-hoc ("-") el .app de macOS.
//
// Sin Developer ID, electron-builder 24 se salta la firma y deja la firma
// original de Electron, que queda inválida al reescribir Info.plist/recursos.
// En Apple Silicon el código arm64 exige firma válida → macOS dice que la app
// "está dañada" y ofrece moverla a la papelera. La firma ad-hoc lo evita.
// Si hay un Developer ID, electron-builder vuelve a firmar encima (--force).
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • ad-hoc signed  ${appPath}`)
}
