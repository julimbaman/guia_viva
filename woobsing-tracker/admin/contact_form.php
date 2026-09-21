<?php
require_once __DIR__ . '/partials/bootstrap.php';
require_once __DIR__ . '/../src/Firestore.php';
require_once __DIR__ . '/../src/ContactRepository.php';

$firestore = new Firestore(FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_DB);
$repo      = new ContactRepository($firestore);

$id       = trim($_GET['id'] ?? $_POST['id'] ?? '');
$isEdit   = $id !== '';
$existing = $isEdit ? $repo->find($id) : null;

if ($isEdit && !$existing) {
    http_response_code(404);
    die('Contacto no encontrado.');
}

$error  = '';
$result = null; // datos del link recién generado, para mostrarlos

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireValidCsrf();
    $input = [
        'name'      => $_POST['name'] ?? '',
        'phone'     => $_POST['phone'] ?? '',
        'procedure' => $_POST['procedure'] ?? '',
        'comment'   => $_POST['comment'] ?? '',
        'ref'       => $_POST['ref'] ?? '',
    ];
    $regenerate = $isEdit ? !empty($_POST['regenerate_link']) : true;

    try {
        if ($isEdit) {
            $result = $repo->update($id, $input, $regenerate);
        } else {
            $result = $repo->create($input);
            $id = $result['id'];
            $isEdit = true;
        }
        $existing = $result;
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$v = fn($key) => h($existing[$key] ?? ($_POST[$key] ?? ''));

$pageTitle = $isEdit ? 'Editar contacto' : 'Nuevo contacto';
$activeNav = 'contacts';
require __DIR__ . '/partials/header.php';
?>

<div class="hdr">
  <div>
    <h1><?= $isEdit ? 'Editar' : 'Nuevo' ?> <span>contacto</span></h1>
    <div class="sub"><a href="contacts.php">← volver a contactos</a></div>
  </div>
</div>

<?php if ($error): ?><div class="alert alert-error"><?= h($error) ?></div><?php endif; ?>
<?php if ($result && !$error): ?>
  <div class="alert alert-ok"><?= $isEdit ? 'Contacto guardado.' : 'Contacto creado.' ?></div>
<?php endif; ?>

<div class="card">
  <form method="post" action="contact_form.php<?= $isEdit ? '?id=' . h($id) : '' ?>">
    <?= csrfField() ?>
    <?php if ($isEdit): ?><input type="hidden" name="id" value="<?= h($id) ?>"><?php endif; ?>

    <div class="field">
      <label>Nombre completo</label>
      <input type="text" name="name" value="<?= $v('name') ?>" required autofocus>
    </div>

    <div class="field">
      <label>Móvil <span class="opt">— con o sin indicativo, se limpia automáticamente</span></label>
      <input type="text" name="phone" value="<?= h($existing['phoneRaw'] ?? ($_POST['phone'] ?? '')) ?>" required>
    </div>

    <div class="field">
      <label>Procedimiento de interés <span class="opt">— opcional</span></label>
      <input type="text" name="procedure" value="<?= $v('procedure') ?>" placeholder="ej: rinoplastia">
    </div>

    <div class="field">
      <label>Comentario / origen del lead <span class="opt">— opcional</span></label>
      <textarea name="comment"><?= $v('comment') ?></textarea>
    </div>

    <div class="field">
      <label>Ref / campaña <span class="opt">— opcional, ej: flyer_barranquilla</span></label>
      <input type="text" name="ref" value="<?= $v('ref') ?>">
    </div>

    <?php if ($isEdit): ?>
    <div class="field" style="display:flex;align-items:center;gap:.5rem">
      <input type="checkbox" name="regenerate_link" id="regenerate_link" value="1" style="width:auto">
      <label for="regenerate_link" style="margin:0;text-transform:none;letter-spacing:0;font-size:.78rem;color:var(--text)">
        Regenerar link trackeado con estos datos (el link anterior sigue funcionando y conservando su historial de clicks)
      </label>
    </div>
    <?php endif; ?>

    <div class="actions-row">
      <button type="submit" class="btn btn-primary"><?= $isEdit ? 'Guardar cambios' : 'Crear y generar link' ?></button>
      <a href="contacts.php" class="btn btn-secondary">Cancelar</a>
    </div>
  </form>

  <?php if ($existing && !empty($existing['trackedUrl'])): ?>
  <div class="result-box">
    <span class="result-url" id="result-url"><?= h($existing['trackedUrl']) ?></span>
    <button class="btn btn-sm btn-secondary" onclick="copyLink()">Copiar</button>
  </div>
  <div style="margin-top:.6rem;font-family:var(--mono);font-size:.68rem;color:var(--muted)">
    hash: <?= h($existing['urlHash8'] ?? '') ?>… · <a href="stats.php?hash=<?= h($existing['urlHash'] ?? '') ?>">ver estadísticas de este link →</a>
  </div>
  <?php endif; ?>
</div>

<script>
function copyLink() {
  var el = document.getElementById('result-url');
  navigator.clipboard.writeText(el.textContent).catch(function() {});
}
</script>

<?php require __DIR__ . '/partials/footer.php'; ?>
