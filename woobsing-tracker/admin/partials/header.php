<?php
/**
 * Requiere $pageTitle (string) y $activeNav ('stats'|'contacts'|'clicks') definidos antes de incluir.
 */
?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= h($pageTitle ?? 'Panel') ?> · Woobsing Count</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="wrap">

<nav class="nav">
  <a href="stats.php" class="<?= ($activeNav ?? '') === 'stats' ? 'active' : '' ?>">📊 Stats</a>
  <div class="sep"></div>
  <a href="contacts.php" class="<?= ($activeNav ?? '') === 'contacts' ? 'active' : '' ?>">👤 Contactos</a>
  <div class="sep"></div>
  <a href="clicks.php" class="<?= ($activeNav ?? '') === 'clicks' ? 'active' : '' ?>">🖱 Clicks</a>
  <div class="sep"></div>
  <a href="download.php">⬇ Exportar</a>
  <span class="spacer"></span>
  <a href="logout.php" style="color:#f87171">Salir</a>
</nav>
