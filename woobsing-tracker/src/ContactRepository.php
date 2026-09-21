<?php
require_once __DIR__ . '/Firestore.php';
require_once __DIR__ . '/Helpers.php';

/**
 * CRUD de "contactos/campañas" (colección `contacts` en Firestore).
 * Un contacto = un paciente/lead con su link de WhatsApp trackeado generado.
 */
class ContactRepository
{
    private const COLLECTION = 'contacts';

    private Firestore $db;

    public function __construct(Firestore $db)
    {
        $this->db = $db;
    }

    /**
     * Crea un contacto nuevo. $input: name, phone, procedure (opcional), comment (opcional), ref (opcional).
     * Si no viene "procedure" explícito, intenta extraerlo del "comment" (igual que el Apps Script).
     */
    public function create(array $input, string $source = 'manual'): array
    {
        $name    = trim((string)($input['name'] ?? ''));
        $phone   = trim((string)($input['phone'] ?? ''));
        $comment = trim((string)($input['comment'] ?? ''));
        $ref     = trim((string)($input['ref'] ?? ''));
        $procedureRaw = trim((string)($input['procedure'] ?? ''));

        if ($name === '') throw new InvalidArgumentException('El nombre es obligatorio.');
        if ($phone === '') throw new InvalidArgumentException('El móvil es obligatorio.');

        $cleanedPhone = cleanPhone($phone);
        if ($cleanedPhone === '') throw new InvalidArgumentException('El móvil no contiene dígitos válidos.');

        if ($procedureRaw === '' && $comment !== '') {
            $procedureRaw = extractProcedure($comment);
        }
        $procedureFmt = $procedureRaw !== '' ? formatProcedure($procedureRaw) : '';

        $message  = buildWhatsappMessage($name, $procedureFmt);
        $linkData = buildLinkData($cleanedPhone, $message, $ref);

        $id  = 'c_' . bin2hex(random_bytes(8));
        $now = date('c');

        $doc = [
            'name'         => $name,
            'phoneRaw'     => $phone,
            'phone'        => $cleanedPhone,
            'procedure'    => $procedureFmt,
            'comment'      => $comment,
            'ref'          => $ref,
            'message'      => $message,
            'whatsappUrl'  => $linkData['whatsappUrl'],
            'trackedUrl'   => $linkData['trackedUrl'],
            'urlHash'      => $linkData['hash'],
            'urlHash8'     => $linkData['hash8'],
            'source'       => $source,
            'createdAt'    => $now,
            'updatedAt'    => $now,
        ];

        if (!$this->db->setDocument(self::COLLECTION, $id, $doc)) {
            throw new RuntimeException('No se pudo guardar el contacto en Firestore.');
        }

        return array_merge(['id' => $id], $doc);
    }

    /**
     * Crea o actualiza un contacto de forma idempotente a partir de un identificador externo
     * (ej: "sheetId:fila" desde Google Sheets). Reintentar con el mismo externalId actualiza
     * el mismo registro en vez de duplicarlo.
     */
    public function upsertExternal(string $externalId, array $input, string $source = 'sheets'): array
    {
        $id = 'ext_' . substr(md5($externalId), 0, 20);
        $existing = $this->find($id);

        $name    = trim((string)($input['name'] ?? ''));
        $phone   = trim((string)($input['phone'] ?? ''));
        $comment = trim((string)($input['comment'] ?? ''));
        $ref     = trim((string)($input['ref'] ?? ''));
        $procedureRaw = trim((string)($input['procedure'] ?? ''));

        if ($name === '') throw new InvalidArgumentException('El nombre es obligatorio.');
        if ($phone === '') throw new InvalidArgumentException('El móvil es obligatorio.');

        $cleanedPhone = cleanPhone($phone);
        if ($cleanedPhone === '') throw new InvalidArgumentException('El móvil no contiene dígitos válidos.');

        if ($procedureRaw === '' && $comment !== '') {
            $procedureRaw = extractProcedure($comment);
        }
        $procedureFmt = $procedureRaw !== '' ? formatProcedure($procedureRaw) : '';

        $message  = buildWhatsappMessage($name, $procedureFmt);
        $linkData = buildLinkData($cleanedPhone, $message, $ref);
        $now      = date('c');

        $doc = [
            'name'         => $name,
            'phoneRaw'     => $phone,
            'phone'        => $cleanedPhone,
            'procedure'    => $procedureFmt,
            'comment'      => $comment,
            'ref'          => $ref,
            'message'      => $message,
            'whatsappUrl'  => $linkData['whatsappUrl'],
            'trackedUrl'   => $linkData['trackedUrl'],
            'urlHash'      => $linkData['hash'],
            'urlHash8'     => $linkData['hash8'],
            'source'       => $source,
            'externalId'   => $externalId,
            'createdAt'    => $existing['createdAt'] ?? $now,
            'updatedAt'    => $now,
        ];

        if (!$this->db->setDocument(self::COLLECTION, $id, $doc)) {
            throw new RuntimeException('No se pudo guardar el contacto en Firestore.');
        }

        return array_merge(['id' => $id], $doc);
    }

    public function find(string $id): ?array
    {
        $doc = $this->db->getDocument(self::COLLECTION, $id);
        if (!$doc) return null;
        return array_merge(['id' => $doc['id']], $doc['fields']);
    }

    /**
     * Actualiza campos editables. Si cambia nombre/procedimiento/teléfono/ref y $regenerateLink=true,
     * recalcula mensaje + link trackeado (el link anterior sigue siendo válido y trazable en el histórico
     * de clicks, solo deja de ser "el actual" del contacto).
     */
    public function update(string $id, array $input, bool $regenerateLink = false): array
    {
        $existing = $this->find($id);
        if (!$existing) throw new RuntimeException('Contacto no encontrado.');

        $name    = trim((string)($input['name'] ?? $existing['name']));
        $phone   = trim((string)($input['phone'] ?? $existing['phoneRaw']));
        $comment = trim((string)($input['comment'] ?? $existing['comment']));
        $ref     = trim((string)($input['ref'] ?? $existing['ref']));
        $procedureRaw = trim((string)($input['procedure'] ?? $existing['procedure']));

        if ($name === '') throw new InvalidArgumentException('El nombre es obligatorio.');

        $cleanedPhone = cleanPhone($phone);
        if ($cleanedPhone === '') throw new InvalidArgumentException('El móvil no contiene dígitos válidos.');

        $procedureFmt = $procedureRaw !== '' ? formatProcedure($procedureRaw) : '';

        $changes = [
            'name'      => $name,
            'phoneRaw'  => $phone,
            'phone'     => $cleanedPhone,
            'procedure' => $procedureFmt,
            'comment'   => $comment,
            'ref'       => $ref,
            'updatedAt' => date('c'),
        ];

        if ($regenerateLink) {
            $message  = buildWhatsappMessage($name, $procedureFmt);
            $linkData = buildLinkData($cleanedPhone, $message, $ref);
            $changes['message']     = $message;
            $changes['whatsappUrl'] = $linkData['whatsappUrl'];
            $changes['trackedUrl']  = $linkData['trackedUrl'];
            $changes['urlHash']     = $linkData['hash'];
            $changes['urlHash8']    = $linkData['hash8'];
        }

        if (!$this->db->updateDocument(self::COLLECTION, $id, $changes)) {
            throw new RuntimeException('No se pudo actualizar el contacto en Firestore.');
        }

        return array_merge($existing, $changes, ['id' => $id]);
    }

    public function delete(string $id): bool
    {
        return $this->db->deleteDocument(self::COLLECTION, $id);
    }

    /**
     * Lista contactos (más recientes primero). $search filtra en memoria por nombre/teléfono/ref
     * (Firestore REST no ofrece full-text search; el volumen esperado es bajo, igual que en el stats
     * original que ya traía hasta 500 registros y filtraba en PHP).
     */
    public function list(string $search = '', int $limit = 500): array
    {
        $rows = $this->db->runQuery([
            'from'    => [['collectionId' => 'contacts']],
            'orderBy' => [['field' => ['fieldPath' => 'createdAt'], 'direction' => 'DESCENDING']],
            'limit'   => $limit,
        ]);

        $contacts = array_map(fn($r) => array_merge(['id' => $r['id']], $r['fields']), $rows);

        if ($search === '') return $contacts;

        $needle = mb_strtolower($search, 'UTF-8');
        return array_values(array_filter($contacts, function ($c) use ($needle) {
            $haystack = mb_strtolower(
                ($c['name'] ?? '') . ' ' . ($c['phoneRaw'] ?? '') . ' ' . ($c['phone'] ?? '') . ' ' . ($c['ref'] ?? ''),
                'UTF-8'
            );
            return str_contains($haystack, $needle);
        }));
    }
}
