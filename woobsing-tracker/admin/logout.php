<?php
require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Auth.php';

startAdminSession();
logoutAdmin();
header('Location: login.php');
exit;
