/**
 * setup-watch.gs — Gmail Push Notifications Setup
 * =================================================
 * Este script reemplaza el trigger de polling que causaba bucles y quemaba cuota.
 *
 * CÓMO FUNCIONA:
 * 1. registerGmailWatch() llama a Gmail API watch() una vez.
 *    Esto le dice a Gmail: "notifícame en Pub/Sub cuando llegue un email nuevo".
 * 2. El watch dura 7 días. Por eso setupWeeklyRenewal() crea un trigger
 *    que ejecuta renewWatch() una vez a la semana automáticamente.
 * 3. Tu servidor Vercel (/api/gmail-pubsub) recibe las notificaciones en tiempo real.
 *
 * USO INICIAL:
 * 1. Configura las constantes de abajo según tu proyecto de GCP.
 * 2. Ejecuta setupWatchAndRenewal() UNA SOLA VEZ desde el editor de Apps Script.
 * 3. ¡Listo! El trigger semanal se encarga de renovar automáticamente.
 *
 * CUOTA QUE USA:
 * - Gmail API: 1 llamada/semana (frente a miles con el polling anterior)
 * - Apps Script: 1 ejecución/semana
 */

// ── CONFIGURA ESTOS VALORES ────────────────────────────────────────────────────

/** El ID de tu proyecto de Google Cloud (ej: "servimed-ia-prod") */
var GCP_PROJECT_ID = 'TU_GCP_PROJECT_ID';

/** El nombre del topic de Pub/Sub que recibe las notificaciones de Gmail */
var PUBSUB_TOPIC = 'projects/' + GCP_PROJECT_ID + '/topics/gmail-push-notifications';

/**
 * Qué emails monitorizar. "me" = la cuenta que ejecuta este script.
 * Puedes añadir un labelId para filtrar solo emails de tu bandeja de entrada:
 * labelIds: ['INBOX']
 */
var GMAIL_USER = 'me';

// ── FUNCIONES PRINCIPALES ──────────────────────────────────────────────────────

/**
 * Ejecuta esto UNA SOLA VEZ para configurar todo.
 * Registra el watch Y crea el trigger semanal de renovación.
 */
function setupWatchAndRenewal() {
  registerGmailWatch();
  setupWeeklyRenewal();
  Logger.log('✅ Watch registrado y trigger semanal creado.');
  Logger.log('Puedes ver el trigger en: Editar → Activadores del proyecto actual');
}

/**
 * Registra el Gmail watch en Pub/Sub.
 * Gmail notificará al topic cada vez que llegue un email nuevo.
 */
function registerGmailWatch() {
  try {
    var response = Gmail.Users.watch(GMAIL_USER, {
      topicName: PUBSUB_TOPIC,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'INCLUDE'
    });
    Logger.log('✅ Watch registrado correctamente:');
    Logger.log('  historyId: ' + response.historyId);
    Logger.log('  expiration: ' + new Date(parseInt(response.expiration)).toLocaleString());
    return response;
  } catch (e) {
    Logger.log('❌ Error registrando watch: ' + e.toString());
    throw e;
  }
}

/**
 * Elimina el watch actual (útil para resetear).
 */
function stopGmailWatch() {
  try {
    Gmail.Users.stop(GMAIL_USER);
    Logger.log('✅ Watch eliminado correctamente.');
  } catch (e) {
    Logger.log('❌ Error eliminando watch: ' + e.toString());
  }
}

/**
 * Renueva el watch (se llama automáticamente cada semana).
 * Solo hace 1 llamada a la API de Gmail — sin bucles, sin riesgo de cuota.
 */
function renewWatch() {
  Logger.log('🔄 Renovando Gmail watch...');
  registerGmailWatch();
}

// ── GESTIÓN DEL TRIGGER SEMANAL ────────────────────────────────────────────────

/**
 * Crea un trigger que ejecuta renewWatch() cada 6 días
 * (el watch dura 7 días, así nos aseguramos de renovarlo antes de que expire).
 */
function setupWeeklyRenewal() {
  // Eliminar triggers anteriores de renewWatch para evitar duplicados
  deleteExistingTriggers('renewWatch');

  ScriptApp.newTrigger('renewWatch')
    .timeBased()
    .everyDays(6)
    .create();

  Logger.log('✅ Trigger semanal de renovación creado.');
}

/**
 * Elimina todos los triggers existentes para una función concreta.
 */
function deleteExistingTriggers(functionName) {
  var triggers = ScriptApp.getProjectTriggers();
  var deleted = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(triggers[i]);
      deleted++;
    }
  }
  if (deleted > 0) {
    Logger.log('🗑️  Eliminados ' + deleted + ' trigger(s) previos para "' + functionName + '".');
  }
}

/**
 * Elimina TODOS los triggers del proyecto.
 * Usar si quieres partir desde cero.
 */
function deleteAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  Logger.log('🗑️  Eliminados ' + triggers.length + ' trigger(s). El proyecto ya no tiene triggers activos.');
}

/**
 * Muestra un resumen del estado actual de los triggers y el watch.
 */
function checkStatus() {
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log('=== ESTADO ACTUAL ===');
  Logger.log('Triggers activos: ' + triggers.length);
  for (var i = 0; i < triggers.length; i++) {
    Logger.log('  • ' + triggers[i].getHandlerFunction() + ' (' + triggers[i].getTriggerSource() + ')');
  }
  Logger.log('');
  Logger.log('Para verificar que el watch está activo, comprueba tu Google Cloud Console:');
  Logger.log('Pub/Sub → Topics → gmail-push-notifications → Suscripciones');
}
