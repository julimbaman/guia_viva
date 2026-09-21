<?php
/**
 * Genera el hash bcrypt para ADMIN_PASSWORD_HASH en config.php.
 * Uso: php scripts/hash_password.php "tu_password_segura"
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    die('Este script solo puede ejecutarse por línea de comandos.');
}

$password = $argv[1] ?? null;
if (!$password) {
    fwrite(STDERR, "Uso: php scripts/hash_password.php \"tu_password_segura\"\n");
    exit(1);
}

echo password_hash($password, PASSWORD_DEFAULT) . "\n";
