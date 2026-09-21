<?php
require_once __DIR__ . '/Firestore.php';

/**
 * Lectura, agregación y borrado de los registros de clicks (colección `clicks`).
 * La lógica de agregación replica la del stats.php original.
 */
class ClickRepository
{
    private const COLLECTION = 'clicks';
    private const PAGE_SIZE  = 500;

    private Firestore $db;

    public function __construct(Firestore $db)
    {
        $this->db = $db;
    }

    /** Trae clicks de los últimos $days días desde Firestore. Vacío si Firestore no responde. */
    public function fetchFromFirestore(int $days): array
    {
        $cutoff = date('c', strtotime("-{$days} days"));

        $rows = $this->db->runQuery([
            'from'    => [['collectionId' => self::COLLECTION]],
            'where'   => [
                'fieldFilter' => [
                    'field' => ['fieldPath' => 'timestamp'],
                    'op'    => 'GREATER_THAN_OR_EQUAL',
                    'value' => ['stringValue' => $cutoff],
                ],
            ],
            'orderBy' => [['field' => ['fieldPath' => 'timestamp'], 'direction' => 'DESCENDING']],
            'limit'   => self::PAGE_SIZE,
        ]);

        $entries = [];
        foreach ($rows as $row) {
            $f = $row['fields'];
            $device  = $f['device']  ?? [];
            $geo     = $f['geo']     ?? [];
            $profile = $f['profile'] ?? [];

            $entries[] = [
                'id'          => $row['id'],
                'ts'          => (string)($f['timestampLocal'] ?? substr((string)($f['timestamp'] ?? ''), 0, 19)),
                'ref'         => (string)($f['ref'] ?? ''),
                'campaignId'  => (string)($f['campaignId'] ?? ''),
                'ip'          => (string)($f['ip'] ?? ''),
                'hash8'       => (string)($f['urlHash8'] ?? ''),
                'hash'        => (string)($f['urlHash'] ?? ''),
                'domain'      => (string)($f['destDomain'] ?? ''),
                'url'         => (string)($f['destUrl'] ?? ''),
                'enriched'    => (bool)($f['enriched'] ?? false),
                'dev_type'    => (string)($device['type'] ?? ''),
                'dev_os'      => (string)($device['os'] ?? ''),
                'dev_browser' => (string)($device['browser'] ?? ''),
                'dev_screen'  => (string)($device['screen'] ?? ''),
                'geo_country' => (string)($geo['country'] ?? ''),
                'geo_city'    => (string)($geo['city'] ?? ''),
                'geo_region'  => (string)($geo['region'] ?? ''),
                'geo_org'     => (string)($geo['org'] ?? ''),
                'geo_connection' => (string)($geo['connection'] ?? ''),
                'p_language'  => (string)($profile['language'] ?? ''),
                'p_timezone'  => (string)($profile['timezone'] ?? ''),
                'p_hw_tier'   => (string)($profile['hardwareTier'] ?? ''),
                'p_ref_source'=> (string)($profile['referrerSource'] ?? ''),
                'p_time_slot' => (string)($profile['timeSlot'] ?? ''),
                'p_segment'   => (string)($profile['inferredSegment'] ?? ''),
            ];
        }
        return $entries;
    }

    /** Fallback si Firestore no responde: lee el clicks.log local. */
    public function readLogFallback(): array
    {
        if (!file_exists(LOG_FILE)) return [];
        $lines   = array_filter(array_map('trim', file(LOG_FILE)));
        $entries = [];
        foreach (array_reverse($lines) as $line) {
            $p = explode(' | ', $line, 7);
            if (count($p) !== 7) continue;
            $entries[] = [
                'id' => '', 'ts' => $p[0], 'ref' => $p[1], 'campaignId' => '',
                'ip' => $p[2], 'hash8' => $p[3], 'hash' => $p[4],
                'domain' => $p[5], 'url' => $p[6], 'enriched' => false,
                'dev_type' => '', 'dev_os' => '', 'dev_browser' => '', 'dev_screen' => '',
                'geo_country' => '', 'geo_city' => '', 'geo_region' => '', 'geo_org' => '', 'geo_connection' => '',
                'p_language' => '', 'p_timezone' => '', 'p_hw_tier' => '',
                'p_ref_source' => '', 'p_time_slot' => '', 'p_segment' => '',
            ];
        }
        return $entries;
    }

    public function deleteClick(string $id): bool
    {
        if ($id === '') return false;
        return $this->db->deleteDocument(self::COLLECTION, $id);
    }

    public function deleteMany(array $ids): int
    {
        $deleted = 0;
        foreach ($ids as $id) {
            if ($this->deleteClick((string)$id)) $deleted++;
        }
        return $deleted;
    }

    /** Agregaciones para el dashboard, idénticas a las del stats.php original. */
    public function aggregate(array $data): array
    {
        $byUrl = [];
        foreach ($data as $e) {
            $h = $e['hash'] ?: $e['hash8'];
            if ($h === '') continue;
            if (!isset($byUrl[$h])) {
                $byUrl[$h] = ['hash' => $h, 'hash8' => $e['hash8'], 'url' => $e['url'],
                              'domain' => $e['domain'], 'count' => 0,
                              'first' => $e['ts'], 'last' => $e['ts'], 'refs' => []];
            }
            $byUrl[$h]['count']++;
            if ($e['ts'] > $byUrl[$h]['last'])  $byUrl[$h]['last']  = $e['ts'];
            if ($e['ts'] < $byUrl[$h]['first']) $byUrl[$h]['first'] = $e['ts'];
            if ($e['ref'] && $e['ref'] !== '—') {
                $byUrl[$h]['refs'][$e['ref']] = ($byUrl[$h]['refs'][$e['ref']] ?? 0) + 1;
            }
        }
        usort($byUrl, fn($a, $b) => $b['count'] - $a['count']);

        $byDomain = [];
        foreach ($data as $e) if ($e['domain']) $byDomain[$e['domain']] = ($byDomain[$e['domain']] ?? 0) + 1;
        arsort($byDomain);

        $byRef = [];
        foreach ($data as $e) {
            $r = ($e['ref'] && $e['ref'] !== '—') ? $e['ref'] : '(sin ref)';
            $byRef[$r] = ($byRef[$r] ?? 0) + 1;
        }
        arsort($byRef);

        $byDay = [];
        foreach ($data as $e) {
            $d = substr($e['ts'], 0, 10);
            if ($d) $byDay[$d] = ($byDay[$d] ?? 0) + 1;
        }
        krsort($byDay);
        $maxDay = $byDay ? max($byDay) : 1;

        $byDevice = [];
        foreach ($data as $e) { $d = $e['dev_type'] ?: 'unknown'; $byDevice[$d] = ($byDevice[$d] ?? 0) + 1; }
        arsort($byDevice);

        $byOs = [];
        foreach ($data as $e) { $o = $e['dev_os'] ?: 'unknown'; $byOs[$o] = ($byOs[$o] ?? 0) + 1; }
        arsort($byOs);

        $byBrowser = [];
        foreach ($data as $e) { $b = $e['dev_browser'] ?: 'unknown'; $byBrowser[$b] = ($byBrowser[$b] ?? 0) + 1; }
        arsort($byBrowser);

        $byCountry = [];
        foreach ($data as $e) { $c = $e['geo_country'] ?: '??'; $byCountry[$c] = ($byCountry[$c] ?? 0) + 1; }
        arsort($byCountry);

        $byCity = [];
        foreach ($data as $e) { $c = $e['geo_city'] ?: 'unknown'; if ($c) $byCity[$c] = ($byCity[$c] ?? 0) + 1; }
        arsort($byCity);

        $bySlot = [];
        foreach ($data as $e) { $s = $e['p_time_slot'] ?: 'unknown'; $bySlot[$s] = ($bySlot[$s] ?? 0) + 1; }
        $slotOrder = ['manana', 'tarde', 'noche', 'madrugada', 'unknown'];
        uksort($bySlot, fn($a, $b) => array_search($a, $slotOrder) - array_search($b, $slotOrder));

        $byRefSource = [];
        foreach ($data as $e) { $s = $e['p_ref_source'] ?: 'unknown'; $byRefSource[$s] = ($byRefSource[$s] ?? 0) + 1; }
        arsort($byRefSource);

        $byHw = [];
        foreach ($data as $e) { $t = $e['p_hw_tier'] ?: 'unknown'; $byHw[$t] = ($byHw[$t] ?? 0) + 1; }

        $enrichedCount = count(array_filter($data, fn($e) => $e['enriched']));

        return compact(
            'byUrl', 'byDomain', 'byRef', 'byDay', 'maxDay', 'byDevice', 'byOs', 'byBrowser',
            'byCountry', 'byCity', 'bySlot', 'byRefSource', 'byHw', 'enrichedCount'
        );
    }
}
