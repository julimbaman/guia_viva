<?php
require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Csrf.php';
require_once __DIR__ . '/../src/Helpers.php';

startAdminSession();

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireValidCsrf();
    $user = trim($_POST['user'] ?? '');
    $pass = (string)($_POST['password'] ?? '');

    // Throttle simple para dificultar fuerza bruta.
    if (!empty($_SESSION['login_lock_until']) && time() < $_SESSION['login_lock_until']) {
        $error = 'Demasiados intentos. Espera unos segundos e inténtalo de nuevo.';
    } elseif (attemptAdminLogin($user, $pass)) {
        unset($_SESSION['login_attempts'], $_SESSION['login_lock_until']);
        $redirect = $_GET['redirect'] ?? 'stats.php';
        $redirect = (str_starts_with($redirect, '/') || str_starts_with($redirect, 'http')) ? 'stats.php' : $redirect;
        header('Location: ' . ($redirect ?: 'stats.php'));
        exit;
    } else {
        $_SESSION['login_attempts'] = ($_SESSION['login_attempts'] ?? 0) + 1;
        if ($_SESSION['login_attempts'] >= 5) {
            $_SESSION['login_lock_until'] = time() + 30;
            $_SESSION['login_attempts'] = 0;
        }
        $error = 'Usuario o contraseña incorrectos.';
    }
}

if (isAdminLoggedIn()) {
    header('Location: stats.php');
    exit;
}
?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ingresar · Woobsing Count</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="login-wrap">
  <div class="card" style="width:340px">
    <h1 style="font-family:var(--disp);font-size:1.4rem;color:var(--white);margin-bottom:1.4rem">
      Woobsing <span style="color:var(--green)">Count</span>
    </h1>
    <?php if ($error): ?>
      <div class="alert alert-error"><?= h($error) ?></div>
    <?php endif; ?>
    <form method="post" action="login.php<?= isset($_GET['redirect']) ? '?redirect=' . h($_GET['redirect']) : '' ?>">
      <?= csrfField() ?>
      <div class="field">
        <label>Usuario</label>
        <input type="text" name="user" autocomplete="username" required autofocus>
      </div>
      <div class="field">
        <label>Contraseña</label>
        <input type="password" name="password" autocomplete="current-password" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">Ingresar</button>
    </form>
  </div>
</div>
</body>
</html>
