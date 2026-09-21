<?php
/**
 * API JSON para integraciones externas (Google Apps Script).
 * Autenticación: header "X-Api-Key: <API_KEY definido en config.php>".
 *
 * POST /api/contacts.php
 *   Body JSON: { "name": "...", "phone": "...", "comment": "...", "ref": "...",
 *                "procedure": "...", "externalId": "..." }
 *   - "name" y "phone" son obligatorios.
 *   - "externalId" es opcional pero recomendado (ej: "<idHoja>:<fila>"): si se repite,
 *     actualiza el mismo contacto en vez de crear uno duplicado.
 *   Respuesta: { ok: true, id, name, phone, procedure, ref, trackedUrl, whatsappUrl, urlHash, urlHash8 }
 */
require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Firestore.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/ContactRepository.php';

function getApiKeyFromRequest(): string
{
    foreach (['HTTP_X_API_KEY', 'HTTP_X_Api_Key'] as $key) {
        if (!empty($_SERVER[$key])) return (string)$_SERVER[$key];
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp($k, 'X-Api-Key') === 0) return (string)$v;
        }
    }
    return (string)($_GET['key'] ?? '');
}

if (!hash_equals(API_KEY, getApiKeyFromRequest())) {
    jsonResponse(['ok' => false, 'error' => 'API key inválida o ausente (header X-Api-Key).'], 401);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'error' => 'Método no soportado. Usa POST.'], 405);
}

$raw   = file_get_contents('php://input');
$input = json_decode($raw, true);
if (!is_array($input)) {
    jsonResponse(['ok' => false, 'error' => 'Body JSON inválido.'], 400);
}

$firestore = new Firestore(FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_DB);
$repo      = new ContactRepository($firestore);

try {
    $externalId = trim((string)($input['externalId'] ?? ''));
    $contact = $externalId !== ''
        ? $repo->upsertExternal($externalId, $input, 'sheets')
        : $repo->create($input, 'sheets');

    jsonResponse([
        'ok'          => true,
        'id'          => $contact['id'],
        'name'        => $contact['name'],
        'phone'       => $contact['phone'],
        'procedure'   => $contact['procedure'],
        'ref'         => $contact['ref'],
        'trackedUrl'  => $contact['trackedUrl'],
        'whatsappUrl' => $contact['whatsappUrl'],
        'urlHash'     => $contact['urlHash'],
        'urlHash8'    => $contact['urlHash8'],
    ]);
} catch (InvalidArgumentException $e) {
    jsonResponse(['ok' => false, 'error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    jsonResponse(['ok' => false, 'error' => 'Error interno al guardar el contacto.'], 500);
}
