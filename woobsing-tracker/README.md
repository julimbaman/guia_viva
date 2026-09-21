# Woobsing Tracker — CRUD + Estadísticas

Reescritura del sistema de links trackeados de WhatsApp (`woobsing.com/count/`) del
Dr. Andrés Vallejo Balen. Mantiene el mismo hosting PHP y la misma base de datos
Firestore (`tracker-shortener-db`) del proyecto original, pero reorganizado en:

- **Tracker público** (`index.php`) — igual que antes: recibe `?url=...&ref=...`,
  registra el click en Firestore y redirige.
- **Panel de administración** (`/admin`, con login real) — dashboard de estadísticas,
  **CRUD de contactos/campañas** (crear, editar, borrar, generar su link trackeado) y
  gestión de los registros de clicks (filtrar, borrar, exportar CSV).
- **API** (`/api/contacts.php`) — para que el Apps Script de la hoja de cálculo cree
  contactos directamente en el sistema, en vez de solo escribir una fórmula en la celda.

## Qué cambió respecto al código original

1. **Credenciales fuera del código fuente.** El API key de Firebase y el password del
   dashboard estaban escritos directamente en `stats.php`/`index.php`. Ahora viven en
   `config.php` (no se sube a git) — ver "Instalación" abajo.
2. **Login real en vez de `?pwd=...` en la URL.** El password ya no viaja en texto
   plano en cada link ni queda en el historial del navegador; ahora hay una pantalla
   de login que guarda una sesión.
3. **`test_firebase.php` ya no es accesible por web.** El archivo original quedaba en
   el mismo directorio público con las credenciales de Firebase expuestas a quien
   entrara a esa URL. El equivalente nuevo (`scripts/test_firebase.php`) solo corre
   por línea de comandos.
4. **CRUD de contactos.** El generador de links (antes `generator.html`, público y sin
   guardar nada) ahora vive en `/admin/contact_form.php`, requiere login, y cada link
   generado queda como un contacto gestionable (editar, borrar, ver sus clicks).
5. **El Apps Script ya no calcula el MD5 ni arma el link por su cuenta** — se lo pide
   a la API (`api/contacts.php`), que además guarda el contacto en el panel. Así la
   hoja de cálculo y el panel siempre muestran los mismos datos.
6. **Gestión de clicks.** Se puede borrar clicks basura/bots y exportar CSV filtrado,
   algo que no existía antes (`download.php` estaba referenciado en `stats.php` pero
   no se incluyó entre los archivos originales).

## Estructura

```
woobsing-tracker/
├── index.php                 tracker público (redirect + registro del click)
├── config.example.php        plantilla de configuración (copiar a config.php)
├── .htaccess                 bloquea acceso web a config.php / clicks.log
├── src/                      clases PHP (no accesibles por web)
│   ├── Config.php            carga y valida config.php
│   ├── Firestore.php         cliente REST de Firestore (sin SDK)
│   ├── Auth.php               login por sesión del panel admin
│   ├── Csrf.php               tokens CSRF para los formularios
│   ├── Helpers.php            teléfono, mensaje de WhatsApp, hash, link
│   ├── ContactRepository.php  CRUD de contactos/campañas
│   └── ClickRepository.php    lectura/agregación/borrado de clicks
├── admin/                    panel protegido por login
│   ├── login.php / logout.php
│   ├── stats.php              dashboard de estadísticas
│   ├── contacts.php           listado + búsqueda de contactos
│   ├── contact_form.php       crear/editar contacto (genera el link)
│   ├── clicks.php             gestión de clicks (filtrar/borrar)
│   ├── download.php           exportar CSV (clicks o contactos)
│   └── assets/style.css
├── api/
│   └── contacts.php          endpoint JSON para el Apps Script (auth por API key)
├── scripts/
│   ├── hash_password.php     genera el hash para ADMIN_PASSWORD_HASH
│   └── test_firebase.php     diagnóstico de conexión (solo CLI)
└── appscript/
    └── GeneradorLinks.gs     Apps Script actualizado, para pegar en tu Sheet
```

## Instalación

### 1. Configurar credenciales

```bash
cd woobsing-tracker
cp config.example.php config.php
```

Edita `config.php` y completa:

- `FIREBASE_API_KEY` — la misma que ya usabas (Firebase → Configuración del proyecto).
- `ADMIN_USER` / `ADMIN_PASSWORD_HASH` — genera el hash con:
  ```bash
  php scripts/hash_password.php "tu_password_segura"
  ```
  y pega el resultado en `ADMIN_PASSWORD_HASH`.
- `API_KEY` — una clave larga y aleatoria para el Apps Script, por ejemplo:
  ```bash
  php -r "echo bin2hex(random_bytes(24)) . PHP_EOL;"
  ```

`config.php` está en `.gitignore` — nunca se sube al repositorio.

### 2. Subir al hosting

Sube todo el contenido de `woobsing-tracker/` (incluyendo `config.php` ya completado)
al directorio `count/` de tu hosting (`woobsing.com/count/`), reemplazando los
archivos antiguos (`index.php`, `stats.php`, `generator.html`, `test_firebase.php`).

Verifica que el hosting soporte `.htaccess` (Apache con `AllowOverride` habilitado,
como suele venir por defecto en cPanel) para que `config.php` y `clicks.log` queden
bloqueados a acceso directo.

### 3. Entrar al panel

Ve a `https://woobsing.com/count/admin/` (te redirige a `login.php`) e ingresa con el
usuario/password que definiste. Desde ahí:

- **Stats** — el dashboard de siempre (clicks por día, dispositivo, geo, etc).
- **Contactos** — crea/edita/borra contactos y genera sus links trackeados.
- **Clicks** — filtra y borra registros de clicks puntuales (bots, pruebas, etc).
- **Exportar** — descarga CSV de clicks o de contactos.

### 4. Conectar el Apps Script

1. Abre tu Google Sheet → Extensiones → Apps Script.
2. Reemplaza el contenido por el de `appscript/GeneradorLinks.gs`.
3. Ajusta `API_KEY` en el script con el mismo valor que pusiste en `config.php`.
4. Guarda y recarga el Sheet — aparecerá el menú **WhatsApp_Woobsing → Generar / actualizar links**.

Cada fila que generes queda como un contacto real en el panel (`/admin/contacts.php`),
identificado por hoja+fila, así que volver a ejecutar el script sobre la misma fila
actualiza el mismo contacto en vez de duplicarlo.

## Notas de seguridad

- El API key de Firebase que ve el navegador (en `index.php`, para el enriquecimiento
  de device/perfil desde el cliente) es el mismo tipo de clave pública que ya se usaba
  en el original — la protección real la da Firestore Security Rules, no el secreto
  de esa clave. Revisa las reglas del proyecto `chatbot-woobsing` si quieres restringir
  qué puede escribir el cliente en la colección `clicks`.
- `ALLOWED_REDIRECT_DOMAINS` en `config.php` permite restringir a qué dominios puede
  redirigir `index.php` (por defecto permite cualquiera, igual que el original) —
  recomendado si te preocupa que el tracker se use como open-redirect.
- El login del panel usa `password_hash`/`password_verify` (bcrypt) y bloquea intentos
  tras 5 fallos seguidos (30s). El API key del Apps Script se compara con
  `hash_equals` para evitar timing attacks.
