// ═══════════════════════════════════════════════════════════════════
//  Dr. Andrés Vallejo Balen · Generador de Links WhatsApp + Tracker
//  woobsing.com/count/  ·  ahora conectado al panel CRUD (api/contacts.php)
//
//  Cada fila de la hoja crea/actualiza un contacto real en el panel de
//  administración (Firestore) en vez de solo escribir una fórmula en la
//  celda. El servidor calcula el hash y arma el link — este script ya
//  no necesita reimplementar MD5 ni la lógica del mensaje.
// ═══════════════════════════════════════════════════════════════════

var API_BASE    = 'https://woobsing.com/count/api/contacts.php'; // ajusta si cambia el dominio/ruta
var API_KEY     = 'PON_AQUI_LA_MISMA_API_KEY_QUE_PUSISTE_EN_config.php';
var TRACKER_REF = 'vallejo_sheets'; // etiqueta que aparece en el dashboard

function generarLinksWhatsApp() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var hoja  = ss.getActiveSheet();
  var sheetId = ss.getId();
  var datos = hoja.getDataRange().getValues();

  if (datos.length < 2) return;

  var filaTitulos = datos[0];

  function findCol(headerName) {
    headerName = headerName.toString().toLowerCase().trim();
    for (var j = 0; j < filaTitulos.length; j++) {
      if (filaTitulos[j] && filaTitulos[j].toString().toLowerCase().trim() === headerName) {
        return j;
      }
    }
    return -1;
  }

  var colNombre        = findCol('nombre');
  var colMovil         = findCol('movil');
  var colLink          = findCol('link');
  var colComentario    = findCol('comentario');
  var colProcedimiento = findCol('procedimiento');

  if (colNombre === -1 || colMovil === -1) {
    throw new Error("No se encontraron las columnas 'nombre' o 'movil'. Verifica los títulos de la hoja.");
  }

  var colDepurado = findCol('teléfono depurado');
  if (colDepurado === -1) {
    colDepurado = filaTitulos.length;
    hoja.getRange(1, colDepurado + 1).setValue('Teléfono Depurado');
    filaTitulos[colDepurado] = 'Teléfono Depurado';
  }
  if (colLink === -1) {
    colLink = filaTitulos.length;
    hoja.getRange(1, colLink + 1).setValue('Link');
    filaTitulos[colLink] = 'Link';
  }
  if (colProcedimiento === -1) {
    colProcedimiento = filaTitulos.length;
    hoja.getRange(1, colProcedimiento + 1).setValue('Procedimiento');
    filaTitulos[colProcedimiento] = 'Procedimiento';
  }

  var totalLinks = 0;
  var errores = 0;

  for (var i = 1; i < datos.length; i++) {
    var nombreRaw   = datos[i][colNombre] || '';
    var telefonoRaw = datos[i][colMovil];
    var comentario  = colComentario !== -1 ? datos[i][colComentario] : '';

    if (!telefonoRaw || !nombreRaw) continue;

    var payload = {
      name:       nombreRaw.toString(),
      phone:      telefonoRaw.toString(),
      comment:    comentario ? comentario.toString() : '',
      ref:        TRACKER_REF,
      externalId: sheetId + ':' + (i + 1), // idempotente: reejecutar esta fila actualiza el mismo contacto
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Api-Key': API_KEY },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    try {
      var resp = UrlFetchApp.fetch(API_BASE, options);
      var json = JSON.parse(resp.getContentText());

      if (json.ok) {
        hoja.getRange(i + 1, colDepurado + 1).setValue(json.phone);
        hoja.getRange(i + 1, colProcedimiento + 1).setValue(json.procedure || '');
        var formula = '=HYPERLINK("' + json.trackedUrl + '";"' + json.phone + '")';
        hoja.getRange(i + 1, colLink + 1).setFormula(formula);
        totalLinks++;
      } else {
        errores++;
        hoja.getRange(i + 1, colLink + 1).setValue('ERROR: ' + (json.error || 'desconocido'));
      }
    } catch (e) {
      errores++;
      hoja.getRange(i + 1, colLink + 1).setValue('ERROR: ' + e.message);
    }
  }

  var msg = '✅ Links generados/actualizados: ' + totalLinks;
  if (errores > 0) msg += '\n⚠ Errores: ' + errores + ' (revisa la columna Link en esas filas)';
  msg += '\n\n📊 Panel de administración:\nhttps://woobsing.com/count/admin/contacts.php';
  SpreadsheetApp.getUi().alert(msg);
}

// ── Menú ──────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WhatsApp_Woobsing')
    .addItem('Generar / actualizar links', 'generarLinksWhatsApp')
    .addToUi();
}
