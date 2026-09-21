<?php
require_once __DIR__ . '/partials/bootstrap.php';
require_once __DIR__ . '/../src/Firestore.php';
require_once __DIR__ . '/../src/ContactRepository.php';

$firestore = new Firestore(FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_DB);
$repo      = new ContactRepository($firestore);

$notice = '';
$error  = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'delete') {
    requireValidCsrf();
    $id = (string)($_POST['id'] ?? '');
    if ($id !== '' && $repo->delete($id)) {
        $notice = 'Contacto eliminado.';
    } else {
        $error = 'No se pudo eliminar el contacto.';
    }
}

$search   = trim($_GET['q'] ?? '');
$contacts = $repo->list($search);

$pageTitle = 'Contactos';
$activeNav = 'contacts';
require __DIR__ . '/partials/header.php';
?>

<div class="hdr">
  <div>
    <h1>Contactos <span>/ Campañas</span></h1>
    <div class="sub"><?= count($contacts) ?> registro(s)<?= $search !== '' ? ' · búsqueda: "' . h($search) . '"' : '' ?></div>
  </div>
  <div style="display:flex;gap:.5rem">
    <a href="download.php?entity=contacts" class="btn btn-secondary">⬇ CSV</a>
    <a href="contact_form.php" class="btn btn-primary">+ Nuevo contacto</a>
  </div>
</div>

<?php if ($notice): ?><div class="alert alert-ok"><?= h($notice) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert alert-error"><?= h($error) ?></div><?php endif; ?>

<form method="get" class="search-bar">
  <input type="search" name="q" placeholder="Buscar por nombre, móvil o ref…" value="<?= h($search) ?>">
  <button type="submit" class="btn btn-secondary">Buscar</button>
  <?php if ($search !== ''): ?><a href="contacts.php" class="btn btn-secondary">✕</a><?php endif; ?>
</form>

<div class="sec">
  <?php if (empty($contacts)): ?>
    <div class="empty">No hay contactos<?= $search !== '' ? ' que coincidan con la búsqueda.' : ' todavía. Crea el primero.' ?></div>
  <?php else: ?>
  <table>
    <thead>
      <tr><th>Nombre</th><th>Móvil</th><th>Procedimiento</th><th>Ref</th><th>Origen</th><th>Creado</th><th>Link</th><th></th></tr>
    </thead>
    <tbody>
    <?php foreach ($contacts as $c): ?>
    <tr>
      <td><strong><?= h($c['name'] ?? '') ?></strong></td>
      <td class="ip"><?= h($c['phone'] ?? '') ?></td>
      <td><?= $c['procedure'] ? h($c['procedure']) : '<span class="dim">—</span>' ?></td>
      <td><?= $c['ref'] ? '<span class="tag ref">' . h($c['ref']) . '</span>' : '<span class="dim">—</span>' ?></td>
      <td><span class="dim"><?= h($c['source'] ?? 'manual') ?></span></td>
      <td class="ts"><?= h(substr($c['createdAt'] ?? '', 0, 16)) ?></td>
      <td>
        <?php if (!empty($c['trackedUrl'])): ?>
          <a href="stats.php?<?= http_build_query(['hash' => $c['urlHash'] ?? '']) ?>" class="dim" style="font-family:var(--mono);font-size:.63rem">ver clicks</a>
        <?php endif; ?>
      </td>
      <td style="white-space:nowrap">
        <a href="contact_form.php?id=<?= h($c['id']) ?>" class="btn btn-sm btn-secondary">Editar</a>
        <button class="btn btn-sm btn-danger" onclick="confirmDelete('<?= h($c['id']) ?>','<?= h(addslashes($c['name'] ?? '')) ?>')">Borrar</button>
      </td>
    </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>
</div>

<form id="delete-form" method="post" style="display:none">
  <?= csrfField() ?>
  <input type="hidden" name="action" value="delete">
  <input type="hidden" name="id" id="delete-id">
</form>

<script>
function confirmDelete(id, name) {
  if (confirm('¿Eliminar el contacto "' + name + '"? Esta acción no se puede deshacer.')) {
    document.getElementById('delete-id').value = id;
    document.getElementById('delete-form').submit();
  }
}
</script>

<?php require __DIR__ . '/partials/footer.php'; ?>
