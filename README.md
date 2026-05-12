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

## Build

```bash
# Compilar + empaquetar para la plataforma actual
npm run build

# Solo compilar sin empaquetar (más rápido para pruebas)
npm run build:unpack
```

Los binarios se generan en `dist/`.

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

Ver también: [`../password-manager-mobile/`](../password-manager-mobile/) para la app móvil.

## Licencia

Uso personal. Sin licencia de distribución.
