<?php
/**
 * Carga config.php (credenciales reales, fuera de git) y valida que exista.
 */

$configFile = __DIR__ . '/../config.php';

if (!file_exists($configFile)) {
    http_response_code(500);
    die(
        'Falta config.php. Copia config.example.php como config.php y completa tus credenciales. ' .
        '(Ver README.md)'
    );
}

require_once $configFile;

$required = [
    'FIREBASE_PROJECT_ID', 'FIREBASE_API_KEY', 'FIREBASE_DB',
    'GA4_ID', 'TRACKER_BASE', 'ADMIN_USER', 'ADMIN_PASSWORD_HASH', 'API_KEY',
];
foreach ($required as $const) {
    if (!defined($const)) {
        http_response_code(500);
        die("Falta la constante {$const} en config.php. Revisa config.example.php.");
    }
}

if (!defined('ALLOWED_REDIRECT_DOMAINS')) {
    define('ALLOWED_REDIRECT_DOMAINS', []);
}
if (!defined('LOG_FILE')) {
    define('LOG_FILE', __DIR__ . '/../clicks.log');
}

date_default_timezone_set('America/Bogota');
