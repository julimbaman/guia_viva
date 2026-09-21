<?php
/**
 * Diagnóstico de conexión a Firestore. Uso: php scripts/test_firebase.php
 * Solo por CLI — nunca debe quedar accesible por web (a diferencia del test_firebase.php
 * original, que exponía las credenciales de Firebase a quien entrara a esa URL).
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    die('Este script solo puede ejecutarse por línea de comandos, no por HTTP.');
}

require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Firestore.php';

$db = new Firestore(FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_DB);
$id = 'diagnostic_' . time();

echo "Escribiendo documento de prueba diagnostics/{$id}...\n";
$ok = $db->setDocument('diagnostics', $id, ['test' => 'hola', 'timestamp' => date('c')]);
echo $ok ? "OK: escritura exitosa.\n" : "FALLÓ: revisa FIREBASE_PROJECT_ID / FIREBASE_API_KEY / FIREBASE_DB en config.php.\n";

if ($ok) {
    echo "Leyendo de vuelta...\n";
    $doc = $db->getDocument('diagnostics', $id);
    echo $doc ? "OK: " . json_encode($doc['fields'], JSON_UNESCAPED_UNICODE) . "\n" : "FALLÓ al leer.\n";

    echo "Borrando documento de prueba...\n";
    $db->deleteDocument('diagnostics', $id);
}
