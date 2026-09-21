<?php
require_once __DIR__ . '/partials/bootstrap.php';
require_once __DIR__ . '/../src/Firestore.php';
require_once __DIR__ . '/../src/ClickRepository.php';

$firestore = new Firestore(FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_DB);
$clicks    = new ClickRepository($firestore);

$notice = '';
$error  = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireValidCsrf();
    $action = $_POST['action'] ?? '';
    if ($action === 'delete_selected') {
        $ids = array_filter((array)($_POST['ids'] ?? []));
        $n   = $clicks->deleteMany($ids);
        $notice = $n > 0 ? "{$n} registro(s) eliminado(s)." : 'No se seleccionó ningún registro válido para eliminar.';
    } elseif ($action === 'delete_one') {
        $id = (string)($_POST['id'] ?? '');
        $error = $clicks->deleteClick($id) ? '' : 'No se pudo eliminar el registro.';
        if ($error === '') $notice = 'Registro eliminado.';
    }
}

$days       = max(1, (int)($_GET['days'] ?? 30));
$filterHash = $_GET['hash'] ?? '';
$filterRef  = $_GET['ref'] ?? '';
$filterDom  = $_GET['domain'] ?? '';

$allEntries = $clicks->fetchFromFirestore($days);
$source     = 'firestore';
if (empty($allEntries)) {
    $allEntries = $clicks->readLogFallback();
    $source = 'log';
}

$data = array_values(array_filter($allEntries, function ($e) use ($filterHash, $filterRef, $filterDom) {
    if ($filterHash && $e['hash'] !== $filterHash) return false;
    if ($filterRef  && $e['ref']  !== $filterRef)  return false;
    if ($filterDom  && $e['domain'] !== $filterDom) return false;
    return true;
}));
$total = count($data);
$shown = array_slice($data, 0, 300);

$pageTitle = 'Gestionar clicks';
$activeNav = 'clicks';
require __DIR__ . '/partials/header.php';
?>

<div class="hdr">
  <div>
    <h1>Gestión de <span>clicks</span></h1>
    <div class="sub"><?= $total ?> registro(s) en los últimos <?= $days ?>d <?= $source === 'log' ? '· usando fallback .log' : '' ?></div>
  </div>
  <a href="stats.php<?= ($_SERVER['QUERY_STRING'] ?? '') ? '?' . h($_SERVER['QUERY_STRING']) : '' ?>" class="btn btn-secondary">← ver dashboard</a>
</div>

<?php if ($notice): ?><div class="alert alert-ok"><?= h($notice) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert alert-error"><?= h($error) ?></div><?php endif; ?>
<?php if ($source === 'log'): ?>
  <div class="alert alert-error">Firestore no respondió: los registros del fallback .log no tienen ID, así que no se pueden borrar desde aquí.</div>
<?php endif; ?>

<div class="toolbar">
  <span style="font-size:.68rem;color:var(--muted);font-family:var(--mono)">Rango:</span>
  <?php foreach ([7, 14, 30, 90, 365] as $d): ?>
    <a href="<?= qp('days', $d) ?>" class="chip <?= $days == $d ? 'on' : '' ?>"><?= $d ?>d</a>
  <?php endforeach; ?>
  <span style="color:var(--b2)">|</span>
  <?php if ($filterHash): ?><span class="chip on">URL: <?= h(substr($filterHash, 0, 8)) ?>…</span><a href="<?= qr('hash') ?>" class="chip kill">✕</a><?php endif; ?>
  <?php if ($filterRef): ?><span class="chip on-ref">ref: <?= h($filterRef) ?></span><a href="<?= qr('ref') ?>" class="chip kill">✕</a><?php endif; ?>
  <?php if ($filterDom): ?><span class="chip on-dom">domain: <?= h($filterDom) ?></span><a href="<?= qr('domain') ?>" class="chip kill">✕</a><?php endif; ?>
</div>

<form method="post" id="bulk-form">
  <?= csrfField() ?>
  <input type="hidden" name="action" value="delete_selected">

  <div class="actions-row" style="margin-top:0;margin-bottom:1rem">
    <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('¿Eliminar los registros seleccionados? Esta acción no se puede deshacer.')">
      🗑 Eliminar seleccionados
    </button>
    <a href="download.php?<?= http_build_query(array_merge($_GET, ['source' => 'firebase', 'format' => 'csv'])) ?>" class="btn btn-secondary btn-sm">⬇ Exportar CSV (filtro actual)</a>
  </div>

  <?php if (empty($shown)): ?>
    <div class="empty">Sin registros en el rango/filtro seleccionado.</div>
  <?php else: ?>
  <table>
    <thead>
      <tr>
        <th><input type="checkbox" onclick="document.querySelectorAll('.row-check').forEach(c=>c.checked=this.checked)"></th>
        <th>Timestamp</th><th>Dominio</th><th>Hash</th><th>Ref</th><th>Device</th><th>Geo</th><th>IP</th><th>URL destino</th><th></th>
      </tr>
    </thead>
    <tbody>
    <?php foreach ($shown as $e): ?>
    <tr>
      <td><?php if ($e['id']): ?><input type="checkbox" class="row-check" name="ids[]" value="<?= h($e['id']) ?>"><?php endif; ?></td>
      <td class="ts"><?= h(substr($e['ts'], 0, 16)) ?></td>
      <td><span class="tag dom"><?= h($e['domain']) ?></span></td>
      <td><span class="tag"><?= h($e['hash8']) ?>…</span></td>
      <td><?php if ($e['ref'] && $e['ref'] !== '—'): ?><span class="tag ref"><?= h($e['ref']) ?></span><?php else: ?><span class="dim">—</span><?php endif; ?></td>
      <td><?php if ($e['dev_type']): ?><span class="tag dev"><?= h($e['dev_type']) ?></span><?php else: ?><span class="dim">—</span><?php endif; ?></td>
      <td><?php if ($e['geo_city']): ?><span class="tag geo"><?= h($e['geo_city']) ?>, <?= h($e['geo_country']) ?></span><?php else: ?><span class="dim">—</span><?php endif; ?></td>
      <td class="ip"><?= h($e['ip']) ?></td>
      <td class="url-c"><a href="<?= h($e['url']) ?>" target="_blank" rel="noopener"><?= h(strlen($e['url']) > 50 ? substr($e['url'], 0, 50) . '…' : $e['url']) ?></a></td>
      <td>
        <?php if ($e['id']): ?>
        <button type="button" class="btn btn-sm btn-danger" onclick="deleteOne('<?= h($e['id']) ?>')">✕</button>
        <?php endif; ?>
      </td>
    </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
  <?php if ($total > 300): ?>
    <div class="dim" style="margin-top:.6rem">… mostrando 300 de <?= $total ?>. Usa un filtro (ref, dominio o rango) para acotar, o exporta el CSV completo.</div>
  <?php endif; ?>
  <?php endif; ?>
</form>

<form id="one-form" method="post" style="display:none">
  <?= csrfField() ?>
  <input type="hidden" name="action" value="delete_one">
  <input type="hidden" name="id" id="one-id">
</form>

<script>
function deleteOne(id) {
  if (confirm('¿Eliminar este registro de click?')) {
    document.getElementById('one-id').value = id;
    document.getElementById('one-form').submit();
  }
}
</script>

<?php require __DIR__ . '/partials/footer.php'; ?>
