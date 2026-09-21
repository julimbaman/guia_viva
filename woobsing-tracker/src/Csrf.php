<?php
/** Token CSRF simple basado en sesión, para proteger los formularios del panel admin. */

function csrfToken(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrfField(): string
{
    return '<input type="hidden" name="csrf_token" value="' . h(csrfToken()) . '">';
}

/** Valida el token recibido en un POST. Corta la ejecución con 403 si no coincide. */
function requireValidCsrf(): void
{
    $sent = $_POST['csrf_token'] ?? '';
    if (empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $sent)) {
        http_response_code(403);
        die('Token CSRF inválido. Recarga la página e intenta de nuevo.');
    }
}
