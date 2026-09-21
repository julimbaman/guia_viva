<?php
/**
 * Cliente REST mínimo para Firestore (sin SDK, solo cURL).
 * Usa la misma base de datos (tracker-shortener-db) que ya usaba el tracker original.
 */
class Firestore
{
    private string $projectId;
    private string $apiKey;
    private string $database;
    private string $baseUrl;

    public function __construct(string $projectId, string $apiKey, string $database)
    {
        $this->projectId = $projectId;
        $this->apiKey    = $apiKey;
        $this->database  = $database;
        $this->baseUrl   = "https://firestore.googleapis.com/v1/projects/{$projectId}/databases/{$database}/documents";
    }

    // ── Conversión PHP <-> Firestore ─────────────────────────────
    public static function encodeValue($value): array
    {
        if ($value === null) return ['nullValue' => null];
        if (is_bool($value)) return ['booleanValue' => $value];
        if (is_int($value)) return ['integerValue' => (string)$value];
        if (is_float($value)) return ['doubleValue' => $value];
        if (is_array($value)) {
            $isList = array_is_list($value);
            if ($isList) {
                return ['arrayValue' => ['values' => array_map([self::class, 'encodeValue'], $value)]];
            }
            $fields = [];
            foreach ($value as $k => $v) $fields[$k] = self::encodeValue($v);
            return ['mapValue' => ['fields' => $fields]];
        }
        return ['stringValue' => (string)$value];
    }

    public static function encodeFields(array $data): array
    {
        $fields = [];
        foreach ($data as $k => $v) $fields[$k] = self::encodeValue($v);
        return $fields;
    }

    public static function decodeValue(array $field)
    {
        if (array_key_exists('nullValue', $field)) return null;
        if (isset($field['stringValue'])) return $field['stringValue'];
        if (isset($field['booleanValue'])) return $field['booleanValue'];
        if (isset($field['integerValue'])) return (int)$field['integerValue'];
        if (isset($field['doubleValue'])) return (float)$field['doubleValue'];
        if (isset($field['timestampValue'])) return $field['timestampValue'];
        if (isset($field['mapValue'])) return self::decodeFields($field['mapValue']['fields'] ?? []);
        if (isset($field['arrayValue'])) {
            $out = [];
            foreach (($field['arrayValue']['values'] ?? []) as $v) $out[] = self::decodeValue($v);
            return $out;
        }
        return '';
    }

    public static function decodeFields(array $fields): array
    {
        $out = [];
        foreach ($fields as $k => $v) $out[$k] = self::decodeValue($v);
        return $out;
    }

    // ── HTTP helper ───────────────────────────────────────────────
    private function request(string $method, string $url, ?array $body = null, int $timeoutMs = 8000): array
    {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT_MS     => $timeoutMs,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        ];
        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($body);
        }
        curl_setopt_array($ch, $opts);
        $response  = curl_exec($ch);
        $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error     = curl_error($ch);
        curl_close($ch);

        return [
            'ok'   => $httpCode >= 200 && $httpCode < 300,
            'code' => $httpCode,
            'body' => $response ? json_decode($response, true) : null,
            'error'=> $error,
        ];
    }

    // ── CRUD de un documento ─────────────────────────────────────
    public function getDocument(string $collection, string $id): ?array
    {
        $url = "{$this->baseUrl}/{$collection}/{$id}?key={$this->apiKey}";
        $res = $this->request('GET', $url);
        if (!$res['ok'] || empty($res['body']['fields'])) return null;
        return ['id' => $id, 'fields' => self::decodeFields($res['body']['fields'])];
    }

    /** Crea o reemplaza (upsert) un documento con ID explícito. */
    public function setDocument(string $collection, string $id, array $data): bool
    {
        $url = "{$this->baseUrl}/{$collection}/{$id}?key={$this->apiKey}";
        $res = $this->request('PATCH', $url, ['fields' => self::encodeFields($data)]);
        return $res['ok'];
    }

    /** Actualiza solo los campos indicados (merge). */
    public function updateDocument(string $collection, string $id, array $data): bool
    {
        $mask = implode('&', array_map(
            fn($f) => 'updateMask.fieldPaths=' . rawurlencode($f),
            array_keys($data)
        ));
        $url = "{$this->baseUrl}/{$collection}/{$id}?key={$this->apiKey}&{$mask}";
        $res = $this->request('PATCH', $url, ['fields' => self::encodeFields($data)]);
        return $res['ok'];
    }

    public function deleteDocument(string $collection, string $id): bool
    {
        $url = "{$this->baseUrl}/{$collection}/{$id}?key={$this->apiKey}";
        $res = $this->request('DELETE', $url);
        return $res['ok'];
    }

    /**
     * Ejecuta una structuredQuery de Firestore y devuelve [{id, fields}, ...] decodificados.
     */
    public function runQuery(array $structuredQuery): array
    {
        $url  = "{$this->baseUrl}:runQuery?key={$this->apiKey}";
        $res  = $this->request('POST', $url, ['structuredQuery' => $structuredQuery], 10000);
        if (!$res['ok'] || !is_array($res['body'])) return [];

        $out = [];
        foreach ($res['body'] as $row) {
            if (!isset($row['document']['fields'])) continue;
            $name = $row['document']['name'] ?? '';
            $id   = $name ? basename($name) : '';
            $out[] = ['id' => $id, 'fields' => self::decodeFields($row['document']['fields'])];
        }
        return $out;
    }
}
