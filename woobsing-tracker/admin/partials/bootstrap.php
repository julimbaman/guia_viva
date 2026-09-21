<?php
/** Incluir al inicio de toda página protegida del panel /admin. */
require_once __DIR__ . '/../../src/Config.php';
require_once __DIR__ . '/../../src/Auth.php';
require_once __DIR__ . '/../../src/Csrf.php';
require_once __DIR__ . '/../../src/Helpers.php';

startAdminSession();
requireAdminLogin();
