<?php
require_once __DIR__ . '/partials/bootstrap.php';
require_once __DIR__ . '/../src/Firestore.php';
require_once __DIR__ . '/../src/ClickRepository.php';
require_once __DIR__ . '/../src/ContactRepository.php';

$firestore = new Firestore(FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_DB);
$entity    = $_GET['entity'] ?? 'clicks';

function csvOut(string $filename, array $rows, array $headers): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $out = fopen('php://output', 'w');
    fputcsv($out, $headers);
    foreach ($rows as $row) fputcsv($out, $row);
    fclose($out);
    exit;
}

if ($entity === 'contacts') {
    $repo = new ContactRepository($firestore);
    $contacts = $repo->list('');
    $rows = array_map(fn($c) => [
        $c['id'] ?? '', $c['name'] ?? '', $c['phone'] ?? '', $c['phoneRaw'] ?? '',
        $c['procedure'] ?? '', $c['ref'] ?? '', $c['comment'] ?? '',
        $c['trackedUrl'] ?? '', $c['whatsappUrl'] ?? '', $c['source'] ?? '',
        $c['createdAt'] ?? '', $c['updatedAt'] ?? '',
    ], $contacts);

    csvOut('contactos_' . date('Y-m-d') . '.csv', $rows, [
        'id', 'nombre', 'movil', 'movil_original', 'procedimiento', 'ref', 'comentario',
        'link_trackeado', 'link_whatsapp', 'origen', 'creado', 'actualizado',
    ]);
}

// ── Export de clicks (default) ────────────────────────────────────
$clicksRepo = new ClickRepository($firestore);
$days       = max(1, (int)($_GET['days'] ?? 365));
$filterHash = $_GET['hash'] ?? '';
$filterRef  = $_GET['ref'] ?? '';
$filterDom  = $_GET['domain'] ?? '';

$allEntries = $clicksRepo->fetchFromFirestore($days);
if (empty($allEntries)) $allEntries = $clicksRepo->readLogFallback();

$data = array_values(array_filter($allEntries, function ($e) use ($filterHash, $filterRef, $filterDom) {
    if ($filterHash && $e['hash'] !== $filterHash) return false;
    if ($filterRef  && $e['ref']  !== $filterRef)  return false;
    if ($filterDom  && $e['domain'] !== $filterDom) return false;
    return true;
}));

$rows = array_map(fn($e) => [
    $e['ts'], $e['ref'], $e['campaignId'], $e['ip'], $e['hash8'], $e['hash'], $e['domain'], $e['url'],
    $e['dev_type'], $e['dev_os'], $e['dev_browser'], $e['dev_screen'],
    $e['geo_country'], $e['geo_city'], $e['geo_region'], $e['geo_org'],
    $e['p_language'], $e['p_timezone'], $e['p_hw_tier'], $e['p_ref_source'], $e['p_time_slot'],
], $data);

csvOut('clicks_' . date('Y-m-d') . '.csv', $rows, [
    'timestamp', 'ref', 'campaign_id', 'ip', 'hash8', 'hash', 'dominio', 'url_destino',
    'device_type', 'device_os', 'device_browser', 'device_screen',
    'geo_pais', 'geo_ciudad', 'geo_region', 'geo_org',
    'idioma', 'timezone', 'hw_tier', 'ref_source', 'franja_horaria',
]);
