import { logger } from "./logger.js";
import { config } from "./config.js";
import { processOutboxRecord } from "./email-service.js";
import { getSupabaseClient } from "./supabase-client.js";

const supabase = getSupabaseClient();

// Env helpers
const envInt = (key, fallback) => {
  const v = process.env[key];
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const WORKER_ENABLED =
  String(process.env.WORKER_ENABLED || "false").toLowerCase() === "true";
const INTERVAL_MS = envInt("WORKER_INTERVAL_MS", 3000);
const BATCH_SIZE = envInt("WORKER_BATCH_SIZE", 10);

let running = false;
let timer = null;

async function fetchQueuedBatch() {
  const { data, error } = await supabase
    .from("correspondence_outbox")
    .select("*")
    .eq("org_id", config.supabase.orgId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw new Error(error.message);
  return data || [];
}

async function tick() {
  if (running) return;
  running = true;

  try {
    const batch = await fetchQueuedBatch();

    if (batch.length === 0) {
      return;
    }

    logger.info("[WORKER] Batch recibido", {
      count: batch.length,
      orgId: config.supabase.orgId,
    });

    for (const record of batch) {
      try {
        logger.info("[WORKER] Procesando outbox", {
          outboxId: record.id,
          eventType: record.event_type,
          to: Array.isArray(record.to_emails) ? record.to_emails.join(", ") : "",
          subject: record.subject,
        });

        // ✅ processOutboxRecord usa nodemailer y actualiza:
        // - sent: status='sent', sent_at, provider_message_id, error=null
        // - failed: status='failed', error='...'
        const result = await processOutboxRecord(record);

        if (result?.success) {
          logger.info("[WORKER] Sent OK", {
            outboxId: record.id,
            messageId: result.messageId,
          });
        } else {
          logger.error("[WORKER] Sent FAIL", {
            outboxId: record.id,
            error: result?.error || "unknown error",
          });
        }
      } catch (err) {
        logger.error("[WORKER] Error procesando registro", {
          outboxId: record?.id,
          error: err?.message || String(err),
        });

        // Si se rompió antes de que processOutboxRecord marcara failed,
        // hacemos un fallback para no dejarlo en queued eternamente.
        try {
          await supabase
            .from("correspondence_outbox")
            .update({
              status: "failed",
              error: err?.message || "Worker error",
            })
            .eq("id", record.id);
        } catch (e2) {
          logger.error("[WORKER] Fallback failed update error", {
            outboxId: record?.id,
            error: e2?.message || String(e2),
          });
        }
      }
    }
  } catch (err) {
    logger.error("[WORKER] Tick error", { error: err?.message || String(err) });
  } finally {
    running = false;
  }
}

export function startOutboxWorker() {
  if (!WORKER_ENABLED) {
    logger.info("[WORKER] Disabled (WORKER_ENABLED=false)");
    return;
  }

  logger.info("[WORKER] Starting...", {
    intervalMs: INTERVAL_MS,
    batchSize: BATCH_SIZE,
    orgId: config.supabase.orgId,
  });

  timer = setInterval(tick, INTERVAL_MS);
  tick(); // primer tick inmediato
}

export function stopOutboxWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}