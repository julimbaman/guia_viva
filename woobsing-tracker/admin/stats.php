<?php
require_once __DIR__ . '/partials/bootstrap.php';
require_once __DIR__ . '/../src/Firestore.php';
require_once __DIR__ . '/../src/ClickRepository.php';

$firestore = new Firestore(FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_DB);
$clicks    = new ClickRepository($firestore);

$days       = max(1, (int)($_GET['days'] ?? 30));
$filterHash = $_GET['hash'] ?? '';
$filterRef  = $_GET['ref'] ?? '';
$filterDom  = $_GET['domain'] ?? '';

$source     = 'firestore';
$allEntries = $clicks->fetchFromFirestore($days);
if (empty($allEntries)) {
    $allEntries = $clicks->readLogFallback();
    $source = 'log';
    $cutoff = date('Y-m-d H:i:s', strtotime("-{$days} days"));
    $allEntries = array_values(array_filter($allEntries, fn($e) => $e['ts'] >= $cutoff));
}
$totalAll = count($allEntries);

$data = array_values(array_filter($allEntries, function ($e) use ($filterHash, $filterRef, $filterDom) {
    if ($filterHash && $e['hash'] !== $filterHash) return false;
    if ($filterRef  && $e['ref']  !== $filterRef)  return false;
    if ($filterDom  && $e['domain'] !== $filterDom) return false;
    return true;
}));
$total = count($data);

$agg = $clicks->aggregate($data);
extract($agg); // byUrl, byDomain, byRef, byDay, maxDay, byDevice, byOs, byBrowser, byCountry, byCity, bySlot, byRefSource, byHw, enrichedCount

$pageTitle = 'Estadísticas';
$activeNav = 'stats';
require __DIR__ . '/partials/header.php';
?>

<div class="hdr">
  <div>
    <h1>URL <span>Click Stats</span></h1>
    <div class="sub">woobsing.com/count · <?= $totalAll ?> registros en los últimos <?= $days ?>d</div>
  </div>
  <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
    <?php if ($source === 'firestore'): ?>
      <span class="badge fb">🔥 Firestore</span>
    <?php else: ?>
      <span class="badge log">⚠ Fallback: .log local</span>
    <?php endif; ?>
    <span class="badge ga">GA4 · <?= h(GA4_ID) ?></span>
  </div>
</div>

<div class="toolbar">
  <span style="font-size:.68rem;color:var(--muted);font-family:var(--mono)">Rango:</span>
  <?php foreach ([7, 14, 30, 90, 365] as $d): ?>
    <a href="<?= qp('days', $d) ?>" class="chip <?= $days == $d ? 'on' : '' ?>"><?= $d ?>d</a>
  <?php endforeach; ?>
  <span style="color:var(--b2)">|</span>
  <?php if ($filterHash): ?>
    <span class="chip on">URL: <?= h(substr($filterHash, 0, 8)) ?>…</span>
    <a href="<?= qr('hash') ?>" class="chip kill">✕</a>
  <?php endif; ?>
  <?php if ($filterRef): ?>
    <span class="chip on-ref">ref: <?= h($filterRef) ?></span>
    <a href="<?= qr('ref') ?>" class="chip kill">✕</a>
  <?php endif; ?>
  <?php if ($filterDom): ?>
    <span class="chip on-dom">domain: <?= h($filterDom) ?></span>
    <a href="<?= qr('domain') ?>" class="chip kill">✕</a>
  <?php endif; ?>
</div>

<div class="kpis">
  <div class="kpi accent"><div class="v"><?= $total ?></div><div class="l">Clicks (<?= $days ?>d)</div></div>
  <div class="kpi"><div class="v"><?= count($byUrl) ?></div><div class="l">URLs únicas</div></div>
  <div class="kpi"><div class="v"><?= count($byDomain) ?></div><div class="l">Dominios</div></div>
  <div class="kpi"><div class="v"><?= count($byDay) ?></div><div class="l">Días activos</div></div>
  <?php if ($total > 0 && count($byDay) > 0): ?>
  <div class="kpi"><div class="v"><?= round($total / count($byDay), 1) ?></div><div class="l">Clicks/día</div></div>
  <?php endif; ?>
  <div class="kpi"><div class="v"><?= count($byCountry) ?></div><div class="l">Países</div></div>
  <div class="kpi"><div class="v"><?= $enrichedCount ?></div><div class="l">Con perfil</div></div>
  <?php if ($byDevice): ?>
  <div class="kpi"><div class="v" style="font-size:1.4rem"><?= h(array_key_first($byDevice)) ?></div><div class="l">Top device</div></div>
  <?php endif; ?>
</div>

<div class="two-col">
  <div class="sec">
    <div class="sec-hdr">Clicks por día <span class="src-tag">Firestore</span></div>
    <?php if (empty($byDay)): ?>
      <div class="empty">Sin datos en el rango.</div>
    <?php else: ?>
    <div class="bars">
      <?php foreach (array_slice($byDay, 0, 30, true) as $day => $cnt): ?>
      <div class="bar-row">
        <span class="bar-lbl"><?= h($day) ?></span>
        <div class="bar-track"><div class="bar-fill green" style="width:<?= max(2, round($cnt / $maxDay * 100)) ?>%"></div></div>
        <span class="bar-n"><?= $cnt ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>

  <div>
    <div class="sec" style="margin-bottom:1.4rem">
      <div class="sec-hdr">Por dominio destino</div>
      <?php if (empty($byDomain)): ?>
        <div class="empty">Sin datos.</div>
      <?php else: ?>
      <table>
        <thead><tr><th>Dominio</th><th>Clicks</th><th>%</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($byDomain as $dom => $cnt): ?>
        <tr>
          <td><span class="tag dom"><?= h($dom) ?></span></td>
          <td><strong><?= $cnt ?></strong></td>
          <td class="dim"><?= $total > 0 ? round($cnt / $total * 100, 1) : 0 ?>%</td>
          <td><a href="<?= qp('domain', $dom) ?>" class="dim" style="font-family:var(--mono);font-size:.63rem">filtrar</a></td>
        </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </div>

    <div class="sec">
      <div class="sec-hdr">Por campaña (ref)</div>
      <?php if (empty($byRef)): ?>
        <div class="empty">Sin refs.</div>
      <?php else: ?>
      <table>
        <thead><tr><th>Ref / Campaña</th><th>Clicks</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($byRef as $r => $cnt): ?>
        <tr>
          <td><span class="tag ref"><?= h($r) ?></span></td>
          <td><strong><?= $cnt ?></strong></td>
          <td><?php if ($r !== '(sin ref)'): ?>
            <a href="<?= qp('ref', $r) ?>" class="dim" style="font-family:var(--mono);font-size:.63rem">filtrar</a>
          <?php endif; ?></td>
        </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </div>
  </div>
</div>

<div class="sec-hdr" style="margin-bottom:1.2rem">
  Datos de enriquecimiento <span class="src-tag">Firestore · <?= $enrichedCount ?> registros con perfil</span>
</div>

<div class="three-col">
  <div class="sec">
    <div class="sec-hdr">Tipo de dispositivo</div>
    <?php if (empty($byDevice)): ?><div class="empty">Sin datos.</div><?php else: ?>
    <?php $maxDev = max($byDevice); ?>
    <div class="bars">
      <?php foreach ($byDevice as $d => $cnt): ?>
      <?php $icon = $d === 'mobile' ? '📱' : ($d === 'tablet' ? '📟' : '💻'); ?>
      <div class="bar-row">
        <span class="bar-lbl"><?= $icon ?> <?= h($d) ?></span>
        <div class="bar-track"><div class="bar-fill orange" style="width:<?= max(2, round($cnt / $maxDev * 100)) ?>%"></div></div>
        <span class="bar-n"><?= $cnt ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>

  <div class="sec">
    <div class="sec-hdr">Sistema operativo</div>
    <?php if (empty($byOs)): ?><div class="empty">Sin datos.</div><?php else: ?>
    <?php $maxOs = max($byOs); $osIcons = ['ios'=>'🍎','android'=>'🤖','windows'=>'🪟','macos'=>'🍏','linux'=>'🐧','unknown'=>'❓']; ?>
    <div class="bars">
      <?php foreach ($byOs as $o => $cnt): ?>
      <div class="bar-row">
        <span class="bar-lbl"><?= $osIcons[$o] ?? '❓' ?> <?= h($o) ?></span>
        <div class="bar-track"><div class="bar-fill purple" style="width:<?= max(2, round($cnt / $maxOs * 100)) ?>%"></div></div>
        <span class="bar-n"><?= $cnt ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>

  <div class="sec">
    <div class="sec-hdr">Browser</div>
    <?php if (empty($byBrowser)): ?><div class="empty">Sin datos.</div><?php else: ?>
    <?php $maxBr = max($byBrowser); $brIcons = ['chrome'=>'🟡','safari'=>'🔵','firefox'=>'🦊','edge'=>'🌀','samsung'=>'📱','unknown'=>'❓']; ?>
    <div class="bars">
      <?php foreach ($byBrowser as $b => $cnt): ?>
      <div class="bar-row">
        <span class="bar-lbl"><?= $brIcons[$b] ?? '🌐' ?> <?= h($b) ?></span>
        <div class="bar-track"><div class="bar-fill yellow" style="width:<?= max(2, round($cnt / $maxBr * 100)) ?>%"></div></div>
        <span class="bar-n"><?= $cnt ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>
</div>

<div class="three-col">
  <div class="sec">
    <div class="sec-hdr">País</div>
    <?php if (empty($byCountry)): ?><div class="empty">Sin datos geo.</div><?php else: ?>
    <?php $maxC = max($byCountry); ?>
    <div class="bars">
      <?php foreach (array_slice($byCountry, 0, 10, true) as $c => $cnt): ?>
      <div class="bar-row">
        <span class="bar-lbl"><?= h($c) ?></span>
        <div class="bar-track"><div class="bar-fill green" style="width:<?= max(2, round($cnt / $maxC * 100)) ?>%"></div></div>
        <span class="bar-n"><?= $cnt ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>

  <div class="sec">
    <div class="sec-hdr">Ciudad</div>
    <?php if (empty($byCity)): ?><div class="empty">Sin datos geo.</div><?php else: ?>
    <?php $maxCi = max($byCity); ?>
    <div class="bars">
      <?php foreach (array_slice($byCity, 0, 10, true) as $ci => $cnt): ?>
      <div class="bar-row">
        <span class="bar-lbl"><?= h($ci) ?></span>
        <div class="bar-track"><div class="bar-fill green" style="width:<?= max(2, round($cnt / $maxCi * 100)) ?>%"></div></div>
        <span class="bar-n"><?= $cnt ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>

  <div class="sec">
    <div class="sec-hdr">Fuente de tráfico</div>
    <?php if (empty($byRefSource)): ?><div class="empty">Sin datos.</div><?php else: ?>
    <?php $maxRs = max($byRefSource); $rsIcons = ['direct'=>'🔗','whatsapp'=>'💬','instagram'=>'📸','facebook'=>'👤','google'=>'🔍','tiktok'=>'🎵','other'=>'🌐','unknown'=>'❓']; ?>
    <div class="bars">
      <?php foreach ($byRefSource as $rs => $cnt): ?>
      <div class="bar-row">
        <span class="bar-lbl"><?= $rsIcons[$rs] ?? '🌐' ?> <?= h($rs) ?></span>
        <div class="bar-track"><div class="bar-fill purple" style="width:<?= max(2, round($cnt / $maxRs * 100)) ?>%"></div></div>
        <span class="bar-n"><?= $cnt ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>
</div>

<div class="two-col">
  <div class="sec">
    <div class="sec-hdr">Franja horaria (hora local del usuario)</div>
    <?php if (empty($bySlot)): ?><div class="empty">Sin datos.</div><?php else: ?>
    <?php $maxSlot = max($bySlot); $slotIcons = ['manana'=>'🌅','tarde'=>'☀️','noche'=>'🌙','madrugada'=>'🌃','unknown'=>'❓']; ?>
    <div class="bars">
      <?php foreach ($bySlot as $s => $cnt): ?>
      <div class="bar-row">
        <span class="bar-lbl"><?= $slotIcons[$s] ?? '🕐' ?> <?= h($s) ?></span>
        <div class="bar-track"><div class="bar-fill yellow" style="width:<?= max(2, round($cnt / $maxSlot * 100)) ?>%"></div></div>
        <span class="bar-n"><?= $cnt ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>

  <div class="sec">
    <div class="sec-hdr">Nivel de dispositivo (hardware tier)</div>
    <?php if (empty($byHw)): ?><div class="empty">Sin datos.</div><?php else: ?>
    <?php $maxHw = max($byHw); $hwIcons = ['low'=>'🟡 Gama baja','mid'=>'🟢 Gama media','high'=>'🔵 Gama alta','unknown'=>'❓']; ?>
    <div class="bars">
      <?php foreach ($byHw as $t => $cnt): ?>
      <div class="bar-row">
        <span class="bar-lbl"><?= $hwIcons[$t] ?? h($t) ?></span>
        <div class="bar-track"><div class="bar-fill orange" style="width:<?= max(2, round($cnt / $maxHw * 100)) ?>%"></div></div>
        <span class="bar-n"><?= $cnt ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>
</div>

<div class="sec">
  <div class="sec-hdr">URLs rastreadas — ranking por clicks</div>
  <?php if (empty($byUrl)): ?>
    <div class="empty">Sin datos en el rango seleccionado.</div>
  <?php else: ?>
  <?php $maxUrl = $byUrl[0]['count']; ?>
  <table>
    <thead><tr><th>#</th><th>Dominio</th><th>URL destino</th><th>Hash</th><th>Refs</th><th>Clicks</th><th>Actividad</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($byUrl as $i => $row): ?>
    <tr>
      <td class="dim"><?= $i + 1 ?></td>
      <td><span class="tag dom"><?= h($row['domain']) ?></span></td>
      <td class="url-c">
        <a href="<?= h($row['url']) ?>" target="_blank" rel="noopener">
          <?= h(strlen($row['url']) > 70 ? substr($row['url'], 0, 70) . '…' : $row['url']) ?>
        </a>
      </td>
      <td><span class="tag"><?= h($row['hash8']) ?>…</span></td>
      <td>
        <?php foreach (array_slice($row['refs'], 0, 3, true) as $r => $c): ?>
          <span class="tag ref"><?= h($r) ?> (<?= $c ?>)</span>
        <?php endforeach; ?>
        <?php if (empty($row['refs'])): ?><span class="dim">—</span><?php endif; ?>
      </td>
      <td>
        <div class="big"><?= $row['count'] ?></div>
        <div class="progress-wrap"><div class="progress-bar" style="width:<?= round($row['count'] / $maxUrl * 100) ?>%"></div></div>
      </td>
      <td class="dim" style="font-size:.68rem;white-space:nowrap"><?= h(substr($row['first'], 0, 16)) ?><br><?= h(substr($row['last'], 0, 16)) ?></td>
      <td><a href="<?= qp('hash', $row['hash']) ?>" style="font-family:var(--mono);font-size:.63rem;color:var(--muted)">filtrar</a></td>
    </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>
</div>

<div class="sec">
  <div class="sec-hdr">
    Log detallado
    <?php if ($filterHash || $filterRef || $filterDom): ?><span style="color:var(--teal)">— filtrado</span><?php endif; ?>
    <span style="color:var(--b2);margin-left:.5rem">(<?= $total ?> registros) · <a href="clicks.php<?= ($_SERVER['QUERY_STRING'] ?? '') ? '?' . h($_SERVER['QUERY_STRING']) : '' ?>">gestionar clicks →</a></span>
  </div>
  <button class="log-toggle" onclick="
    var t=document.getElementById('log-tbl');
    var open=t.style.display!=='none';
    t.style.display=open?'none':'block';
    this.textContent=open?'▶ Mostrar log (<?= $total ?> filas)':'▼ Ocultar log';
  ">▶ Mostrar log (<?= $total ?> filas)</button>

  <div id="log-tbl" style="display:none">
    <?php if (empty($data)): ?>
      <div class="empty">Sin registros.</div>
    <?php else: ?>
    <table>
      <thead><tr><th>#</th><th>Timestamp</th><th>Dominio</th><th>Hash</th><th>Ref</th><th>Device</th><th>Geo</th><th>Franja</th><th>IP</th><th>URL destino</th></tr></thead>
      <tbody>
      <?php foreach (array_slice($data, 0, 500) as $i => $e): ?>
      <tr>
        <td class="dim"><?= $total - $i ?></td>
        <td class="ts"><?= h(substr($e['ts'], 0, 16)) ?></td>
        <td><span class="tag dom"><?= h($e['domain']) ?></span></td>
        <td><span class="tag"><?= h($e['hash8']) ?>…</span></td>
        <td><?php if ($e['ref'] && $e['ref'] !== '—'): ?><span class="tag ref"><?= h($e['ref']) ?></span><?php else: ?><span class="dim">—</span><?php endif; ?></td>
        <td><?php if ($e['dev_type']): ?><span class="tag dev"><?= h($e['dev_type']) ?></span><?php if ($e['dev_os']): ?><span class="dim"> <?= h($e['dev_os']) ?></span><?php endif; ?><?php else: ?><span class="dim">—</span><?php endif; ?></td>
        <td><?php if ($e['geo_city']): ?><span class="tag geo"><?= h($e['geo_city']) ?>, <?= h($e['geo_country']) ?></span><?php else: ?><span class="dim">—</span><?php endif; ?></td>
        <td class="dim"><?= h($e['p_time_slot']) ?: '—' ?></td>
        <td class="ip"><?= h($e['ip']) ?></td>
        <td class="url-c"><a href="<?= h($e['url']) ?>" target="_blank" rel="noopener"><?= h(strlen($e['url']) > 70 ? substr($e['url'], 0, 70) . '…' : $e['url']) ?></a></td>
      </tr>
      <?php endforeach; ?>
      <?php if (count($data) > 500): ?>
      <tr><td colspan="10" style="text-align:center;padding:1rem;color:var(--muted);font-family:var(--mono);font-size:.7rem">
        … mostrando 500 de <?= $total ?> registros. <a href="download.php?source=firebase&format=csv" style="color:var(--teal)">Descarga el CSV completo</a>
      </td></tr>
      <?php endif; ?>
      </tbody>
    </table>
    <?php endif; ?>
  </div>
</div>

<?php require __DIR__ . '/partials/footer.php'; ?>
