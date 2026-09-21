<?php
/**
 * ═══════════════════════════════════════════════════════════════
 *  URL TRACKER & REDIRECTOR — woobsing.com/count/index.php
 *  Registra el click en Firestore (+ backup local) y redirige a ?url=
 * ═══════════════════════════════════════════════════════════════
 */
require_once __DIR__ . '/src/Config.php';
require_once __DIR__ . '/src/Firestore.php';
require_once __DIR__ . '/src/Helpers.php';

$destUrl    = isset($_GET['url']) ? trim($_GET['url']) : '';
$ref        = isset($_GET['ref']) ? substr(trim($_GET['ref']), 0, 120) : '';
$campaignId = isset($_GET['cid']) ? trim($_GET['cid']) : '';

if ($destUrl === '' || !isValidHttpUrl($destUrl)) {
    http_response_code(400);
    echo '<h2 style="font-family:monospace;padding:2rem">Error: ?url= requerido (debe comenzar con https://)</h2>';
    exit;
}

$destDomain = parse_url($destUrl, PHP_URL_HOST) ?: 'unknown';
if (!isAllowedRedirectDomain($destDomain)) {
    http_response_code(403);
    echo '<h2 style="font-family:monospace;padding:2rem">Dominio de destino no permitido.</h2>';
    exit;
}

// ── Metadata server-side ─────────────────────────────────────────
$ip            = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown')[0]);
$timestamp     = date('Y-m-d H:i:s');
$timestampIso  = date('c');
$urlHash       = md5($destUrl);
$urlHash8      = substr($urlHash, 0, 8);
$userAgent     = $_SERVER['HTTP_USER_AGENT'] ?? '';
$clickId       = $urlHash8 . '_' . time() . '_' . substr(md5($ip . $userAgent), 0, 6);

$isMobile = (bool)preg_match('/(Mobile|Android|iPhone|iPad|iPod)/i', $userAgent);
$isTablet = (bool)preg_match('/(iPad|Tablet|tablet)/i', $userAgent);
$deviceTypeServer = $isTablet ? 'tablet' : ($isMobile ? 'mobile' : 'desktop');

$os = 'unknown';
if (preg_match('/Windows/i', $userAgent))        $os = 'windows';
elseif (preg_match('/Macintosh/i', $userAgent))  $os = 'macos';
elseif (preg_match('/Android/i', $userAgent))    $os = 'android';
elseif (preg_match('/iPhone|iPad/i', $userAgent))$os = 'ios';
elseif (preg_match('/Linux/i', $userAgent))      $os = 'linux';

// ── Log TXT backup local ─────────────────────────────────────────
$logLine = implode(' | ', [$timestamp, $ref ?: '—', $ip, $urlHash8, $urlHash, $destDomain, $destUrl]) . PHP_EOL;
@file_put_contents(LOG_FILE, $logLine, FILE_APPEND | LOCK_EX);

// ── Geo lookup server-side (ip-api.com, timeout corto) ────────────
function get_geo_server(string $ip): array
{
    if ($ip === 'unknown' || $ip === '127.0.0.1') return [];
    $url = "http://ip-api.com/json/{$ip}?fields=status,country,countryCode,regionName,city,lat,lon,org";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT_MS     => 800,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $response = curl_exec($ch);
    $code     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code !== 200 || !$response) return [];
    $data = json_decode($response, true);
    if (!$data || ($data['status'] ?? '') !== 'success') return [];

    return [
        'country'    => $data['countryCode'] ?? '',
        'city'       => $data['city'] ?? '',
        'region'     => $data['regionName'] ?? '',
        'lat'        => (float)($data['lat'] ?? 0),
        'lng'        => (float)($data['lon'] ?? 0),
        'org'        => $data['org'] ?? '',
        'connection' => isset($data['org']) && preg_match('/mobile|celular/i', $data['org']) ? 'mobile' : 'broadband',
    ];
}
$geo = get_geo_server($ip);

$clickDoc = [
    'clickId'        => $clickId,
    'timestamp'      => $timestampIso,
    'timestampLocal' => $timestamp,
    'ref'            => $ref ?: '',
    'campaignId'     => $campaignId ?: '',
    'ip'             => $ip,
    'urlHash'        => $urlHash,
    'urlHash8'       => $urlHash8,
    'destUrl'        => $destUrl,
    'destDomain'     => $destDomain,
    'userAgent'      => substr($userAgent, 0, 512),
    'device'         => ['type' => $deviceTypeServer, 'os' => $os, 'browser' => '', 'screen' => ''],
    'geo'            => [
        'country' => $geo['country'] ?? '', 'city' => $geo['city'] ?? '', 'region' => $geo['region'] ?? '',
        'lat' => $geo['lat'] ?? 0, 'lng' => $geo['lng'] ?? 0, 'org' => $geo['org'] ?? '',
        'connection' => $geo['connection'] ?? '',
    ],
    'profile'        => [
        'language' => '', 'timezone' => '', 'inferredSegment' => '', 'hardwareTier' => '', 'referrerSource' => '',
    ],
    'enriched'       => false,
];

$firestore = new Firestore(FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_DB);
$firestore->setDocument('clicks', $clickId, $clickDoc); // no bloquea el redirect si falla; el .log ya quedó

$jsDest      = json_encode($destUrl);
$jsDomain    = json_encode($destDomain);
$jsHash      = json_encode($urlHash8);
$jsHashFull  = json_encode($urlHash);
$jsRef       = json_encode($ref ?: '(none)');
$jsGa4Id     = json_encode(GA4_ID);
$jsClickId   = json_encode($clickId);
$jsProjectId = json_encode(FIREBASE_PROJECT_ID);
$jsApiKey    = json_encode(FIREBASE_API_KEY);
?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redirigiendo… <?= h($urlHash8) ?></title>

<script async src="https://www.googletagmanager.com/gtag/js?id=<?= GA4_ID ?>"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('js', new Date());
</script>

<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #080810; min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px; font-family: 'DM Mono', 'Courier New', monospace;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #3dffa0; box-shadow: 0 0 18px #3dffa0;
         animation: pulse .8s ease-in-out infinite alternate; }
  @keyframes pulse { to { opacity: .15; transform: scale(.4); } }
  .domain { font-size: .68rem; color: #3dffa0; opacity: .4; letter-spacing: .12em; }
  .hash   { font-size: .6rem;  color: #252540; letter-spacing: .08em; }
</style>
</head>
<body>

<div class="dot"></div>
<div class="domain"><?= h($destDomain) ?></div>
<div class="hash"><?= h($urlHash8) ?></div>

<script>
(function() {
  var DEST        = <?= $jsDest ?>;
  var DOMAIN      = <?= $jsDomain ?>;
  var HASH        = <?= $jsHash ?>;
  var REF         = <?= $jsRef ?>;
  var GA4_ID      = <?= $jsGa4Id ?>;
  var CLICK_ID    = <?= $jsClickId ?>;
  var PROJECT_ID  = <?= $jsProjectId ?>;
  var API_KEY     = <?= $jsApiKey ?>;

  var redirected  = false;
  function goNow() {
    if (redirected) return;
    redirected = true;
    window.location.href = DEST;
  }
  var hardTimeout = setTimeout(goNow, 1500);

  function collectBrowserData() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e) {}
    var lang = navigator.language || navigator.userLanguage || '';
    var cores = navigator.hardwareConcurrency || 0;
    var hwTier = cores <= 4 ? 'low' : (cores <= 8 ? 'mid' : 'high');
    var w = screen.width || window.innerWidth;
    var deviceType = w < 768 ? 'mobile' : (w < 1024 ? 'tablet' : 'desktop');
    var screenRes = (screen.width || 0) + 'x' + (screen.height || 0);
    var ua = navigator.userAgent;
    var browser = 'unknown';
    if (/Edg\//i.test(ua))          browser = 'edge';
    else if (/Chrome/i.test(ua))    browser = 'chrome';
    else if (/Safari/i.test(ua))    browser = 'safari';
    else if (/Firefox/i.test(ua))   browser = 'firefox';
    else if (/Samsung/i.test(ua))   browser = 'samsung';
    var ref = document.referrer || '';
    var refSource = 'direct';
    if (/instagram/i.test(ref))      refSource = 'instagram';
    else if (/facebook/i.test(ref))  refSource = 'facebook';
    else if (/whatsapp/i.test(ref))  refSource = 'whatsapp';
    else if (/google/i.test(ref))    refSource = 'google';
    else if (/tiktok/i.test(ref))    refSource = 'tiktok';
    else if (ref !== '')             refSource = 'other';
    var hour = new Date().getHours();
    var timeSlot = hour < 6 ? 'madrugada' : (hour < 12 ? 'manana' : (hour < 18 ? 'tarde' : 'noche'));

    return {
      timezone: tz, language: lang, hardwareTier: hwTier, deviceType: deviceType,
      screenRes: screenRes, browser: browser, referrerSource: refSource, timeSlot: timeSlot, cores: cores,
    };
  }

  function enrichFirestore(browserData) {
    var seg = browserData.deviceType + '_' + browserData.hardwareTier + '_' + browserData.timeSlot;
    var fields = {
      device: { mapValue: { fields: {
        type:    { stringValue: browserData.deviceType },
        browser: { stringValue: browserData.browser },
        screen:  { stringValue: browserData.screenRes },
      }}},
      profile: { mapValue: { fields: {
        language:        { stringValue: browserData.language },
        timezone:        { stringValue: browserData.timezone },
        hardwareTier:    { stringValue: browserData.hardwareTier },
        referrerSource:  { stringValue: browserData.referrerSource },
        timeSlot:        { stringValue: browserData.timeSlot },
        cores:           { doubleValue: browserData.cores },
        inferredSegment: { stringValue: seg },
      }}},
      enriched: { booleanValue: true },
    };
    var url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
              '/databases/tracker-shortener-db/documents/clicks/' + CLICK_ID +
              '?key=' + API_KEY +
              '&updateMask.fieldPaths=device' +
              '&updateMask.fieldPaths=profile' +
              '&updateMask.fieldPaths=enriched';
    if (typeof fetch !== 'undefined') {
      fetch(url, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fields }), keepalive: true,
      }).catch(function() {});
    }
  }

  function runGA4(browserData) {
    if (typeof gtag !== 'function') { goNow(); return; }
    var cleanPageUrl = window.location.origin + window.location.pathname.replace(/index\.php$/, '') + HASH;
    gtag('config', GA4_ID, { page_location: cleanPageUrl, page_title: 'count/' + HASH, send_page_view: true });
    gtag('event', 'url_click', {
      dest_domain: DOMAIN, url_hash: HASH, ref: REF, campaign: REF,
      device_type: browserData ? browserData.deviceType : '',
      hardware_tier: browserData ? browserData.hardwareTier : '',
      referrer_source: browserData ? browserData.referrerSource : '',
      page_location: cleanPageUrl,
      event_callback: function() { clearTimeout(hardTimeout); goNow(); },
      event_timeout: 400,
    });
  }

  function run() {
    var browserData = collectBrowserData();
    enrichFirestore(browserData);
    runGA4(browserData);
  }

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
</script>

</body>
</html>
