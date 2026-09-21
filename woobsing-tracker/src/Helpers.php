<?php
/**
 * Funciones compartidas: escape de salida, querystring, teléfono, mensaje de WhatsApp
 * y construcción del link trackeado. La lógica de teléfono/procedimiento/mensaje replica
 * exactamente la del Apps Script original para que los links generados sean compatibles.
 */

function h($s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

/** Devuelve la querystring actual con $key=$value agregado/reemplazado. */
function qp(string $key, $value): string
{
    $p = $_GET;
    $p[$key] = $value;
    return '?' . http_build_query($p);
}

/** Devuelve la querystring actual sin $key. */
function qr(string $key): string
{
    $p = $_GET;
    unset($p[$key]);
    return '?' . http_build_query($p);
}

/** Limpia un teléfono crudo y le antepone 57 si hace falta (mismo criterio que el Apps Script). */
function cleanPhone(string $raw): string
{
    $phone = preg_replace('/[^0-9]/', '', $raw) ?? '';
    if ($phone === '') return '';
    if (strlen($phone) === 10) {
        $phone = '57' . $phone;
    } elseif (strpos($phone, '57') !== 0) {
        $phone = '57' . $phone;
    }
    return $phone;
}

/** [procedimiento=algo] o cual_es_tu_procedimiento_de_interes?=algo dentro de un comentario libre. */
function extractProcedure(string $comentario): string
{
    if (trim($comentario) === '') return '';

    if (preg_match_all('/\[procedimiento\s*=\s*([^\]]+)\]/i', $comentario, $m1) && !empty($m1[1])) {
        return implode(' / ', array_map('trim', $m1[1]));
    }
    if (preg_match('/cu[aá]l_es_tu_procedimiento_de_inter[eé]s\??\s*=\s*([^<\n|]+)/i', $comentario, $m2)) {
        return trim($m2[1]);
    }
    return '';
}

function formatProcedure(string $proc): string
{
    $proc = str_replace('_', ' ', $proc);
    return mb_convert_case($proc, MB_CASE_TITLE, 'UTF-8');
}

function firstNameCapitalized(string $fullName): string
{
    $first = trim(explode(' ', trim($fullName))[0] ?? '');
    if ($first === '') return 'allí';
    return mb_convert_case(mb_strtolower($first, 'UTF-8'), MB_CASE_TITLE, 'UTF-8');
}

/** Construye el mensaje de WhatsApp saludando por nombre y mencionando el procedimiento si existe. */
function buildWhatsappMessage(string $fullName, string $procedureFormatted): string
{
    $first = firstNameCapitalized($fullName);
    if ($procedureFormatted !== '') {
        return "Hola, {$first} \xF0\x9F\x91\x8B\n\n" .
               "Somos el equipo del Dr. Andrés Vallejo Balen, otorrinolaringólogo y cirujano plástico facial.\n" .
               'Nos contactaste por una: ' . mb_strtoupper($procedureFormatted, 'UTF-8') . ".\n" .
               'Gracias por escribirnos.';
    }
    return "Hola, {$first} \xF0\x9F\x91\x8B\n\n" .
           "Somos el equipo del Dr. Andrés Vallejo Balen, otorrinolaringólogo y cirujano plástico facial.\n" .
           'Gracias por escribirnos. ¿En qué podemos ayudarte hoy?';
}

/** Devuelve ['whatsappUrl', 'hash', 'hash8', 'trackedUrl'] a partir de un teléfono ya limpio y un mensaje. */
function buildLinkData(string $cleanedPhone, string $message, string $ref): array
{
    $whatsappUrl = 'https://api.whatsapp.com/send?phone=' . $cleanedPhone . '&text=' . rawurlencode($message);
    $hash  = md5($whatsappUrl);
    $hash8 = substr($hash, 0, 8);
    $trackedUrl = rtrim(TRACKER_BASE, '/') . '/?url=' . rawurlencode($whatsappUrl)
                . ($ref !== '' ? '&ref=' . rawurlencode($ref) : '');

    return [
        'whatsappUrl' => $whatsappUrl,
        'hash'        => $hash,
        'hash8'       => $hash8,
        'trackedUrl'  => $trackedUrl,
    ];
}

function jsonResponse($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function isValidHttpUrl(string $url): bool
{
    return (bool)preg_match('#^https?://#i', $url);
}

function isAllowedRedirectDomain(string $domain): bool
{
    if (empty(ALLOWED_REDIRECT_DOMAINS)) return true; // sin restricción configurada
    foreach (ALLOWED_REDIRECT_DOMAINS as $allowed) {
        if (strcasecmp($domain, $allowed) === 0 || str_ends_with(strtolower($domain), '.' . strtolower($allowed))) {
            return true;
        }
    }
    return false;
}
