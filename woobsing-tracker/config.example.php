<?php
/**
 * Copia este archivo como config.php (mismo directorio) y completa tus valores reales.
 * config.php NUNCA se sube a git (está en .gitignore) — ahí van las credenciales reales.
 */

// ── Firebase / Firestore ─────────────────────────────────────────
define('FIREBASE_PROJECT_ID', 'chatbot-woobsing');
define('FIREBASE_API_KEY',    'PON_AQUI_TU_API_KEY');
define('FIREBASE_DB',         'tracker-shortener-db');

// ── Google Analytics 4 ────────────────────────────────────────────
define('GA4_ID', 'G-M13W1XT5E9');

// ── Tracker público (index.php) ──────────────────────────────────
define('TRACKER_BASE', 'https://woobsing.com/count/');

// Dominios permitidos para redirigir (?url=). Deja el array vacío para
// permitir cualquier dominio (comportamiento original). Se recomienda
// restringir para evitar que el redirector se use como open-redirect.
define('ALLOWED_REDIRECT_DOMAINS', []); // ej: ['api.whatsapp.com', 'wa.me']

// ── Panel de administración (/admin) ─────────────────────────────
// Usuario y hash de contraseña (NUNCA guardes la contraseña en texto plano).
// Genera el hash con: php scripts/hash_password.php "tu_password"
define('ADMIN_USER',          'admin');
define('ADMIN_PASSWORD_HASH', '$2y$10$REEMPLAZA_ESTE_HASH_GENERADO');

// ── API para integraciones externas (ej: Google Apps Script) ─────
// Clave compartida que el Apps Script envía en el header X-Api-Key.
// Genera una cadena aleatoria larga, ej: bin2hex(random_bytes(24))
define('API_KEY', 'PON_AQUI_UNA_CLAVE_LARGA_Y_ALEATORIA');

// ── Rutas locales ─────────────────────────────────────────────────
define('LOG_FILE', __DIR__ . '/clicks.log'); // backup local de clicks
