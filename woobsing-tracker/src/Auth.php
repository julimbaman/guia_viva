<?php
/**
 * Autenticación del panel /admin por sesión (reemplaza el antiguo ?pwd=... en la URL).
 */

function startAdminSession(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off'),
        ]);
        session_start();
    }
}

function isAdminLoggedIn(): bool
{
    return !empty($_SESSION['admin_user']);
}

/** Compara usuario/contraseña contra config.php. Devuelve true si son correctos. */
function attemptAdminLogin(string $user, string $password): bool
{
    $userOk = hash_equals(ADMIN_USER, $user);
    $passOk = password_verify($password, ADMIN_PASSWORD_HASH);
    if ($userOk && $passOk) {
        session_regenerate_id(true);
        $_SESSION['admin_user'] = $user;
        return true;
    }
    return false;
}

function logoutAdmin(): void
{
    $_SESSION = [];
    session_destroy();
}

/** Corta la ejecución y redirige a login si no hay sesión activa. Llamar al inicio de cada página protegida. */
function requireAdminLogin(): void
{
    startAdminSession();
    if (!isAdminLoggedIn()) {
        $redirect = urlencode($_SERVER['REQUEST_URI'] ?? '');
        header('Location: login.php?redirect=' . $redirect);
        exit;
    }
}
