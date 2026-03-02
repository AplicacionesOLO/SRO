import express from "express";
import cors from "cors";
import { sendEmail } from "./email-service.js";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { startOutboxWorker } from "./outbox-worker.js";

const app = express();
const PORT = config.server.port;

// CORS para desarrollo
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "smtp-local-service",
    timestamp: new Date().toISOString(),
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      from: config.smtp.from,
    },
    worker: {
      enabled: String(process.env.WORKER_ENABLED || "false"),
      intervalMs: Number(process.env.WORKER_INTERVAL_MS || 3000),
      batchSize: Number(process.env.WORKER_BATCH_SIZE || 10),
    },
  });
});

// Endpoint de prueba manual
app.post("/api/email/send-test", async (req, res) => {
  try {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        success: false,
        error: "to, subject y body son requeridos",
      });
    }

    const result = await sendEmail({
      orgId: config.supabase.orgId,
      to,
      subject,
      body,
      eventType: "manual_test",
    });

    res.json(result);
  } catch (error) {
    logger.error("Error en send-test", { error: error?.message });

    res.status(500).json({
      success: false,
      message: "Error al enviar correo de prueba",
      error: error?.message,
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  logger.info(`Servicio SMTP local iniciado en puerto ${PORT}`);
  logger.info(`SMTP Host: ${config.smtp.host}:${config.smtp.port}`);
  logger.info(`From: ${config.smtp.from}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);

  // ✅ Arranca el worker (si WORKER_ENABLED=true)
  startOutboxWorker();
});

export default app;
