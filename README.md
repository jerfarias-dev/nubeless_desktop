# Password Manager — Desktop

Gestor de contraseñas local para escritorio. Los datos se almacenan **únicamente en tu equipo**, cifrados con AES-256-GCM. Ningún dato sale a Internet.

## Características

- 🔐 Cifrado AES-256-GCM con clave derivada por PBKDF2-SHA512 (600 000 iteraciones)
- 📋 CRUD completo de cuentas y categorías
- 🔑 Generador de contraseñas con evaluador de fortaleza
- 📋 Portapapeles con auto-limpieza a los 15 segundos
- 📤 Exportación / importación en formato `.enc` (cifrado) y CSV
- 📲 Sincronización WiFi local con la app móvil vía QR (sin Internet)
- 🪟 Interfaz sin bordes nativos en macOS (traffic lights integrados)

## Stack

| Capa | Tecnología |
|------|-----------|
| Shell | Electron 29 |
| UI | React 18 + TypeScript 5 |
| Bundler | electron-vite 2 + Vite 5 |
| Estilos | Tailwind CSS 3 |
| Estado | Zustand 4 |
| Base de datos | better-sqlite3 (SQLite) |
| Crypto | Node.js `node:crypto` (nativo) |
| Iconos | Lucide React |
| Empaquetado | electron-builder |

## Requisitos

- Node.js 20+
- npm 10+

## Desarrollo

```bash
# Instalar dependencias
npm install

# Iniciar en modo desarrollo (Electron + hot reload)
npm run dev
```

## Build y distribución

> ⚠️ **Importante:** electron-builder solo puede empaquetar para la plataforma desde la que se ejecuta. Para generar un instalador Windows necesitas compilar en Windows, y viceversa para macOS.

### macOS (genera `.dmg`)

```bash
npm run build
```

Esto produce dos archivos en `dist/`:

| Archivo | Arquitectura | Para |
|---------|-------------|------|
| `Password Manager-1.0.0.dmg` | x64 (Intel) | Macs Intel |
| `Password Manager-1.0.0-arm64.dmg` | arm64 | Apple Silicon (M1/M2/M3/M4) |

**Instalación:**
1. Doble clic al `.dmg` correspondiente a tu Mac
2. Arrastra la app a la carpeta **Aplicaciones**
3. Abre desde Launchpad o Aplicaciones

> La primera vez que la abras macOS puede bloquearla por no estar firmada con un Apple Developer ID. Para permitirla: **Ajustes del Sistema → Privacidad y Seguridad → Abrir de todos modos**.

### Windows (genera instalador `.exe`)

```bash
npm run build
```

Esto produce el instalador NSIS en `dist/`:

| Archivo | Para |
|---------|------|
| `Password Manager Setup 1.0.0.exe` | Windows x64 |

**Instalación:**
1. Doble clic al `.exe`
2. Acepta el aviso de SmartScreen (es normal en apps sin firma comercial: clic en **Más información → Ejecutar de todas formas**)
3. Elige carpeta de instalación
4. Marca **crear acceso directo en el escritorio**
5. La app aparece en el menú Inicio como _Password Manager_

### Compilar sin empaquetar (para pruebas rápidas)

```bash
npm run build:unpack
```

Genera la app sin envolverla en `.dmg` o `.exe`. Útil para depurar el build.

### Compilación cruzada

electron-builder permite compilar para Windows desde macOS/Linux (necesita `wine`), pero **no al revés**. Recomendación: para releases oficiales, compila cada plataforma en su propio sistema.

## Estructura del proyecto

```
├── electron/
│   ├── main.ts          # Proceso principal, ventana, IPC handlers
│   ├── preload.ts       # Bridge seguro renderer ↔ main (contextBridge)
│   ├── crypto/          # AES-256-GCM, PBKDF2, gestión del vault
│   ├── db/              # SQLite: cuentas y categorías
│   ├── ipc/             # Handlers IPC por dominio (accounts, sync…)
│   └── sync/            # Servidor HTTP local para sync WiFi con móvil
├── src/
│   ├── components/      # Componentes React reutilizables
│   ├── pages/           # LoginPage, MainPage
│   ├── store/           # Estado global con Zustand
│   └── types/           # Tipos TypeScript compartidos
├── electron-builder.yml # Configuración de empaquetado
└── electron.vite.config.ts
```

## Seguridad

- La contraseña maestra **nunca se almacena en disco**; solo la sal PBKDF2 y un token de verificación cifrado
- Cada cuenta se cifra individualmente con AES-256-GCM
- El sync WiFi usa una clave de sesión efímera con TTL de 2 minutos, validada con `timingSafeEqual`
- Los datos se guardan en el `userData` del OS, completamente fuera del repositorio

## Importar contraseñas vía CSV

El CSV debe tener las siguientes columnas (la primera fila es cabecera):

```
platform,username,password,url,notes,category,is_favorite
GitHub,miusuario,mipassword,https://github.com,,Trabajo,0
```

- `category`: nombre de la categoría (se crea automáticamente si no existe)
- `is_favorite`: `1` o `0`
- `url` y `notes`: opcionales

## Sincronización con móvil

1. Asegúrate de que desktop y móvil estén en la **misma red WiFi** (o usa el hotspot del teléfono)
2. En el desktop: Sincronizar → aparece un QR con TTL de 2 minutos
3. Escanea con la app móvil → ingresa tu contraseña maestra → listo

Ver también: [`password-manager-mobile`](https://github.com/jerfarias-dev/password-manager-mobile) para la app móvil.

## Licencia

Uso personal. Sin licencia de distribución.
