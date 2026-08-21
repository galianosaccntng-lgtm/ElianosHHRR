import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { Firestore } from "@google-cloud/firestore";
import { humanConfidence } from "./src/authenticity";

dotenv.config();

const app = express();

// Protect endpoints with payload size limits
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "";

// In-memory rate limiting mechanism per IP + route
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitStore = new Map<string, RateLimitRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (now > record.resetTime) rateLimitStore.delete(key);
  }
}, 10 * 60 * 1000).unref();

function createRateLimiter(windowMs: number, maxRequests: number, message: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${ip}:${req.originalUrl || req.baseUrl || req.path}`;
    const now = Date.now();

    const record = rateLimitStore.get(key);
    if (!record || now > record.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({ error: message });
    }

    record.count += 1;
    return next();
  };
}

const adminVerifyLimiter = createRateLimiter(15 * 60 * 1000, 5, "Too many admin verification attempts. Please try again in 15 minutes.");
const chatLimiter = createRateLimiter(60 * 1000, 30, "Too many chat requests. Please slow down.");
const sessionSyncLimiter = createRateLimiter(60 * 1000, 60, "Too many sync requests. Please slow down.");
const evaluateLimiter = createRateLimiter(10 * 60 * 1000, 5, "Too many evaluation requests. Please wait before submitting again.");
const adminFollowUpLimiter = createRateLimiter(60 * 60 * 1000, 10, "Too many follow-up emails sent. Please try again later (maximum 10 per hour).");
const findIncompleteLimiter = createRateLimiter(15 * 60 * 1000, 10, "Too many search requests. Please try again in 15 minutes.");

// Centralized admin authentication verification helper
function verifyAdminAccess(provided: string | undefined, res: express.Response): boolean {
  if (!ADMIN_PASSCODE) {
    res.status(503).json({ error: "Admin access is not configured" });
    return false;
  }
  if (!provided || provided !== ADMIN_PASSCODE) {
    res.status(401).json({ error: "Contraseña incorrecta. Acceso denegado." });
    return false;
  }
  return true;
}

// Local fallback storage directory & file
const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_FILE = path.join(DATA_DIR, "interviews.json");

function ensureLocalDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]), "utf-8");
  }
}

// Initialize Firestore if on Cloud Run or explicitly enabled
let firestoreClient: Firestore | null = null;
const isFirestoreEnabled = Boolean(process.env.K_SERVICE || process.env.FIRESTORE_ENABLED === "true");

if (isFirestoreEnabled) {
  try {
    firestoreClient = new Firestore();
    console.log("[Storage] Initialized Firestore persistence (collection: 'interviews')");
  } catch (fsErr) {
    console.warn("[Storage] Could not initialize Firestore client, fallback to local storage:", fsErr);
    firestoreClient = null;
  }
}

function getLocalSessions(): any[] {
  ensureLocalDataFile();
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("[LocalStorage] Error reading local file:", err);
    return [];
  }
}

function saveLocalSessions(sessions: any[]) {
  ensureLocalDataFile();
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (err) {
    console.error("[LocalStorage] Error writing local file:", err);
  }
}

// Unified Async Storage layer (Firestore with automatic Local Fallback)
async function getStoredSessions(): Promise<any[]> {
  if (firestoreClient) {
    try {
      const snapshot = await firestoreClient.collection("interviews").get();
      const sessions: any[] = [];
      snapshot.forEach((doc) => {
        sessions.push(doc.data());
      });
      return sessions.sort((a, b) => {
        const tA = a.date ? new Date(a.date).getTime() : 0;
        const tB = b.date ? new Date(b.date).getTime() : 0;
        return tB - tA;
      });
    } catch (fsErr) {
      console.warn("[Storage] Firestore read failed, falling back to local file:", fsErr);
    }
  }
  return getLocalSessions();
}

function sanitizeSessionMessages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => {
    if (!m || typeof m !== "object") return m;
    const sanitizedMsg: any = {
      role: m.role === "model" ? "model" : "user",
      parts: Array.isArray(m.parts)
        ? m.parts.map((p: any) => ({ text: typeof p?.text === "string" ? p.text : "" }))
        : [{ text: "" }],
    };

    if (m.metrics && typeof m.metrics === "object") {
      const {
        typingDurationMs,
        keystrokes,
        maxInsertChunk,
        responseDelayMs,
        tabSwitches,
        wpm,
        pasteAttempts,
        lowConfidenceWarned,
      } = m.metrics;

      const sanitizedMetrics: any = {};
      if (typeof typingDurationMs === "number" && !isNaN(typingDurationMs)) sanitizedMetrics.typingDurationMs = typingDurationMs;
      if (typeof keystrokes === "number" && !isNaN(keystrokes)) sanitizedMetrics.keystrokes = keystrokes;
      if (typeof maxInsertChunk === "number" && !isNaN(maxInsertChunk)) sanitizedMetrics.maxInsertChunk = maxInsertChunk;
      if (typeof responseDelayMs === "number" && !isNaN(responseDelayMs)) sanitizedMetrics.responseDelayMs = responseDelayMs;
      if (typeof tabSwitches === "number" && !isNaN(tabSwitches)) sanitizedMetrics.tabSwitches = tabSwitches;
      if (typeof wpm === "number" && !isNaN(wpm)) sanitizedMetrics.wpm = wpm;
      if (typeof pasteAttempts === "number" && !isNaN(pasteAttempts)) sanitizedMetrics.pasteAttempts = pasteAttempts;
      if (typeof lowConfidenceWarned === "boolean") sanitizedMetrics.lowConfidenceWarned = lowConfidenceWarned;

      if (Object.keys(sanitizedMetrics).length > 0) {
        const textLen = sanitizedMsg.parts?.[0]?.text?.length || 0;
        const computedConf = humanConfidence(sanitizedMetrics, textLen);
        if (computedConf !== null) {
          sanitizedMetrics.humanConfidence = computedConf;
        }
        sanitizedMsg.metrics = sanitizedMetrics;
      }
    }

    return sanitizedMsg;
  });
}

async function upsertSession(session: any): Promise<void> {
  if (!session || !session.id) return;
  const safeSession: any = {
    ...session,
    messages: sanitizeSessionMessages(session.messages),
    date: session.date || new Date().toISOString(),
  };

  if (session.deletedAt === null) {
    safeSession.deletedAt = null;
  } else if (typeof session.deletedAt === "string") {
    safeSession.deletedAt = session.deletedAt;
  }

  if (firestoreClient) {
    try {
      await firestoreClient.collection("interviews").doc(safeSession.id).set(safeSession, { merge: true });
      return;
    } catch (fsErr) {
      console.warn("[Storage] Firestore write failed, falling back to local file:", fsErr);
    }
  }

  // Local fallback
  const sessions = getLocalSessions();
  const idx = sessions.findIndex((s) => s.id === safeSession.id);
  if (idx >= 0) {
    sessions[idx] = { ...sessions[idx], ...safeSession };
    if (safeSession.deletedAt === null) {
      delete sessions[idx].deletedAt;
    }
  } else {
    if (safeSession.deletedAt === null) {
      delete safeSession.deletedAt;
    }
    sessions.unshift(safeSession);
  }
  saveLocalSessions(sessions);
}

async function deleteStoredSession(id: string): Promise<number> {
  if (firestoreClient) {
    try {
      await firestoreClient.collection("interviews").doc(id).delete();
      const snapshot = await firestoreClient.collection("interviews").count().get();
      return snapshot.data().count;
    } catch (fsErr) {
      console.warn("[Storage] Firestore delete failed, falling back to local file:", fsErr);
    }
  }

  let sessions = getLocalSessions();
  sessions = sessions.filter((s) => s.id !== id);
  saveLocalSessions(sessions);
  return sessions.length;
}

// Initialize Gemini API
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Valid Gemini models prioritized by performance
const RESILIENT_MODELS_POOL = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
];

const INTERVIEW_QUESTIONS: Record<string, string[]> = {
  "Barista": [
    "What made you interested in applying for a Barista position with Ellianos Coffee?",
    "Our drive-thru moves very fast during morning rush hours. How do you maintain a positive, energetic attitude when there is a long line of cars?",
    "Working in an 800 sq ft double drive-thru kiosk means space is tight and teamwork is crucial. Can you describe how you communicate with coworkers in tight spaces?",
    "Punctuality is critical for our morning opening shifts. Do you have reliable transportation and flexibility for morning or weekend hours?",
    "How do you handle a situation where a customer is unhappy with their coffee or espresso drink?",
    "CRISIS SCENARIO: You are operating window A's espresso station. Through the headset, an order for window B comes in with three complex Lotus Edge energy drinks and two hot grits bowls. Simultaneously, the car in front of you honks asking for extra napkins. Walk me through your exact thought process to prioritize these tasks.",
    "Do you have any experience with physical stamina tasks, such as standing for long shifts or lifting milk crates up to 30 lbs?",
    "What is one skill or strength you bring that will help make the new Lehigh Acres location successful?"
  ],
  "Shift Leader": [
    "What motivated you to apply for the Shift Leader role at our new Lehigh Acres location?",
    "How do you keep baristas motivated and focused during high-volume peak rush periods?",
    "If an espresso machine or grinder experiences a technical issue during a busy rush, how do you manage the team and customer expectations?",
    "Tell me about a time you had to address a team member who arrived late or was not following speed-of-service standards.",
    "CRISIS SCENARIO: You are operating window A's espresso station. Through the headset, an order for window B comes in with three complex Lotus Edge energy drinks and two hot grits bowls. Simultaneously, the car in front of you honks asking for napkins. Walk me through your exact thought process to prioritize these tasks as the leader on shift.",
    "How do you manage cash register balancing, inventory restocking, and safety protocols before closing?",
    "What is your leadership style when training brand-new team members who have never worked in a coffee drive-thru before?"
  ],
  "Store Manager": [
    "What interests you most about leading the brand-new Ellianos Coffee store in Lehigh Acres as Store Manager?",
    "How do you balance drive-thru speed of service with high Italian-quality standards and waste control?",
    "Describe your strategy for building and retaining a high-performing team of shift leaders and baristas.",
    "How do you approach labor scheduling and inventory management to optimize store profitability and minimize product waste?",
    "CRISIS SCENARIO: You are on the floor during peak morning rush. A key piece of refrigeration fails, window times exceed target by 2 minutes, and a customer at window A demands to speak with the manager. How do you prioritize and direct your team?",
    "What key performance indicators (KPIs) do you track daily to measure the operational health of a store?"
  ]
};

function generateLocalInterviewResponse(position: string, history: any[], candidateInfo: any): string {
  const candidateName = candidateInfo?.name || "there";
  const userMessages = history.filter((m: any) => m.role === "user");
  const modelMessages = history.filter((m: any) => m.role === "model");
  const questions = INTERVIEW_QUESTIONS[position] || INTERVIEW_QUESTIONS["Barista"];

  // First message: Welcoming & Mandatory Guidelines
  if (modelMessages.length === 0) {
    return `Hello ${candidateName}! Welcome to your interview with Ellianos Coffee for our brand-new Lehigh Acres location. We are excited to have you apply to join our team!\n\nBefore we begin, here are a few important guidelines:\n* You can finish and submit your application at **any time** by clicking the **"Submit"** button on your screen.\n* You can also let me know right here in the chat whenever you would like to conclude.\n* The full interview consists of up to **25 questions**, asked one at a time.\n\nLet's start with our first question:\n\n**${questions[0]}**`;
  }

  const lastUserText = userMessages[userMessages.length - 1]?.parts?.[0]?.text?.toLowerCase() || "";

  // Check if candidate wants to end early
  if (
    lastUserText.includes("finish") ||
    lastUserText.includes("submit") ||
    lastUserText.includes("done") ||
    lastUserText.includes("terminate") ||
    lastUserText.includes("conclude") ||
    lastUserText.includes("terminar") ||
    lastUserText.includes("finalizar")
  ) {
    return `Thank you so much, ${candidateName}. We have captured all of your responses for the ${position} position at our Lehigh Acres location. Whenever you are ready, please click the **"Submit"** button on your screen to send your completed application to our hiring team!`;
  }

  // Pick next question
  const questionIndex = modelMessages.length;
  if (questionIndex >= questions.length || questionIndex >= 25) {
    return `Thank you, ${candidateName}! You have successfully answered all the core interview questions for the ${position} role. Please review your answers and click the **"Submit"** button to finalize your application and submit it to our management team.`;
  }

  const nextQuestion = questions[questionIndex];
  return `Thank you for sharing that, ${candidateName}. That gives us great insight into how you work.\n\n**${nextQuestion}**`;
}

// Honest fallback evaluation without invented scores or fake HR signatures
function generateLocalEvaluation(session: any): string {
  const { position, candidateInfo, messages } = session;
  const candidateName = candidateInfo?.name || "Candidate";
  const userResponses = (messages || []).filter((m: any) => m.role === "user");
  const totalAnswers = userResponses.length;

  const responsesWithMetrics = userResponses.filter((m: any) => m.metrics);
  let authenticityBlock = "";

  if (responsesWithMetrics.length > 0) {
    const scores: { index: number; score: number }[] = responsesWithMetrics.map((m: any, i: number) => {
      const textLen = m.parts?.[0]?.text?.length || 0;
      const score = typeof m.metrics.humanConfidence === "number"
        ? m.metrics.humanConfidence
        : (humanConfidence(m.metrics, textLen) ?? 100);
      return { index: i + 1, score };
    });

    const avgConfidence = Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length);
    const minItem = scores.reduce((min, curr) => curr.score < min.score ? curr : min, scores[0]);

    authenticityBlock = `### Authenticity Signals
- **Confianza promedio de autoría humana:** ${avgConfidence}%
- **Respuesta con menor confianza:** Respuesta #${minItem.index} (${minItem.score}%)
- **Métricas:** Consulte el panel de RRHH para ver detalles de velocidad de escritura (WPM), cambios de pestaña e intentos de pegado por respuesta.`;
  } else {
    authenticityBlock = `### Authenticity Signals
- **Confianza de autoría humana:** Sin datos de telemetría.
- **Métricas:** No se registraron datos de telemetría en esta sesión.`;
  }

  return `# Candidate Interview Record (Manual Review Required)

**Candidate Name:** ${candidateName}  
**Position:** ${position || "Barista"}, Ellianos Coffee (Lehigh Acres, FL)  
**Contact:** ${candidateInfo?.phone || "N/A"} | ${candidateInfo?.email || "N/A"}  
**Date:** ${new Date().toLocaleDateString()}  
**Responses Captured:** ${totalAnswers}  

---

### AI Evaluation Status: Unavailable
La evaluación con IA no estaba disponible en el momento del envío. No se generó puntaje ni recomendación automática. Por favor revise la transcripción completa manualmente para evaluar la idoneidad del candidato.

${authenticityBlock}`;
}

async function generateContentWithInfiniteResilience(request: any) {
  const primaryModel = request.model || RESILIENT_MODELS_POOL[0];
  const modelsToTry = [...new Set([primaryModel, ...RESILIENT_MODELS_POOL])];
  let lastError: any = null;

  for (const model of modelsToTry) {
    const currentRequest = { ...request, model };

    try {
      console.log(`[AI Engine] Dispatching request with model: ${model}`);
      
      const requestPromise = ai.models.generateContent(currentRequest);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${model} exceeded 10000ms response window`)), 10000)
      );

      const response: any = await Promise.race([requestPromise, timeoutPromise]);
      if (response && response.text) {
        console.log(`[AI Engine] Generation successful using ${model}`);
        return response;
      }
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || error?.status || "API Error";
      console.log(`[AI Engine] Model ${model} unavailable (${errorMsg}). Trying next fallback...`);
      
      const retryDelayStr = error?.error?.details?.find?.((d: any) => d?.retryDelay)?.retryDelay || error?.details?.[0]?.retryDelay;
      if (retryDelayStr && typeof retryDelayStr === "string") {
        const seconds = parseInt(retryDelayStr.replace(/[^0-9]/g, ""), 10);
        if (!isNaN(seconds) && seconds > 0 && seconds <= 2) {
          console.log(`[AI Engine] Short delay detected (${seconds}s). Waiting...`);
          await new Promise((r) => setTimeout(r, seconds * 1000));
        }
      }
      continue;
    }
  }

  throw lastError || new Error(`AI Engine Quota Exceeded`);
}

function getMailTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

// Single candidate live session sync endpoint (Protected with validation & rate limiting)
app.post("/api/sessions/sync", sessionSyncLimiter, async (req, res) => {
  try {
    const { session } = req.body;
    
    // Strict schema & boundary validation
    if (!session || typeof session !== "object") {
      return res.status(400).json({ error: "Invalid session payload" });
    }

    const { id, messages } = session;
    if (typeof id !== "string" || !id.trim() || id.length > 100 || id.includes("/") || id === "." || id === "..") {
      return res.status(400).json({ error: "Invalid session ID format" });
    }

    if (messages !== undefined) {
      if (!Array.isArray(messages) || messages.length > 200) {
        return res.status(400).json({ error: "Invalid session messages payload" });
      }
    }

    // Strip deletedAt from candidate sync payload to prevent unauthorized soft-delete modification
    const { deletedAt: _ignoredDeletedAt, ...cleanSession } = session;

    await upsertSession(cleanSession);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[SessionSync] Error syncing session:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// Candidate resume lookup endpoint for incomplete applications
app.post("/api/sessions/find-incomplete", findIncompleteLimiter, async (req, res) => {
  try {
    const { name, phone, email } = req.body || {};

    if (
      typeof name !== "string" || !name.trim() ||
      typeof phone !== "string" || !phone.trim() ||
      typeof email !== "string" || !email.trim()
    ) {
      return res.status(400).json({ success: false, error: "Name, phone, and email are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.replace(/\D/g, "");

    if (!normalizedPhone || !normalizedEmail) {
      return res.json({ found: false });
    }

    const sessions = await getStoredSessions();
    const matched = sessions.filter((s: any) => {
      if (!s || s.deletedAt) return false;
      if (s.status === "Completed") return false;
      if (!s.candidateInfo) return false;
      const sEmail = (s.candidateInfo.email || "").trim().toLowerCase();
      const sPhone = (s.candidateInfo.phone || "").replace(/\D/g, "");
      return sEmail === normalizedEmail && sPhone === normalizedPhone;
    });

    if (matched.length === 0) {
      return res.json({ found: false });
    }

    // Sort by date descending to pick the most recent
    matched.sort((a: any, b: any) => {
      const tA = a.date ? new Date(a.date).getTime() : 0;
      const tB = b.date ? new Date(b.date).getTime() : 0;
      return tB - tA;
    });

    const session = matched[0];
    if (!session || !session.id || !Array.isArray(session.messages)) {
      return res.json({ found: false });
    }

    return res.json({ found: true, session });
  } catch (err: any) {
    console.error("[FindIncomplete] Error:", err);
    return res.json({ found: false });
  }
});

// RRHH Staff Protected Endpoints
app.post("/api/admin/verify", adminVerifyLimiter, (req, res) => {
  const { passcode } = req.body || {};
  if (!verifyAdminAccess(passcode, res)) return;
  return res.json({ authenticated: true });
});

app.get("/api/admin/sessions", async (req, res) => {
  const authHeader = req.headers["x-admin-passcode"] as string | undefined;
  if (!verifyAdminAccess(authHeader, res)) return;

  try {
    const sessions = await getStoredSessions();

    // Background auto-purge: permanently delete sessions whose deletedAt is > 30 days old
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const toPurge = sessions.filter((s: any) => {
      if (!s || !s.deletedAt) return false;
      const deletedTime = new Date(s.deletedAt).getTime();
      return !isNaN(deletedTime) && (now - deletedTime) > thirtyDaysMs;
    });

    if (toPurge.length > 0) {
      Promise.all(toPurge.map((s: any) => deleteStoredSession(s.id))).catch((purgeErr) => {
        console.warn("[Admin] Background purge error:", purgeErr);
      });
    }

    res.json({ sessions });
  } catch (err: any) {
    console.error("[Admin] Error retrieving sessions:", err);
    res.status(500).json({ error: "Failed to retrieve sessions" });
  }
});

// Soft delete: moves session to trash with deletedAt timestamp
app.delete("/api/admin/sessions/:id", async (req, res) => {
  const authHeader = req.headers["x-admin-passcode"] as string | undefined;
  if (!verifyAdminAccess(authHeader, res)) return;

  const { id } = req.params;
  try {
    const sessions = await getStoredSessions();
    const session = sessions.find((s) => s.id === id);
    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    const deletedAt = new Date().toISOString();
    const updated = { ...session, deletedAt };
    await upsertSession(updated);
    res.json({ success: true, session: updated });
  } catch (err: any) {
    console.error("[Admin] Error soft-deleting session:", err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

// Restore session from trash
app.post("/api/admin/sessions/:id/restore", async (req, res) => {
  const authHeader = req.headers["x-admin-passcode"] as string | undefined;
  if (!verifyAdminAccess(authHeader, res)) return;

  const { id } = req.params;
  try {
    const sessions = await getStoredSessions();
    const session = sessions.find((s) => s.id === id);
    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    const updated = { ...session, deletedAt: null };
    await upsertSession(updated);
    res.json({ success: true, session: updated });
  } catch (err: any) {
    console.error("[Admin] Error restoring session:", err);
    res.status(500).json({ error: "Failed to restore session" });
  }
});

// Permanent deletion from trash
app.delete("/api/admin/sessions/:id/permanent", async (req, res) => {
  const authHeader = req.headers["x-admin-passcode"] as string | undefined;
  if (!verifyAdminAccess(authHeader, res)) return;

  const { id } = req.params;
  try {
    const remaining = await deleteStoredSession(id);
    res.json({ success: true, remaining });
  } catch (err: any) {
    console.error("[Admin] Error permanently deleting session:", err);
    res.status(500).json({ error: "Failed to permanently delete session" });
  }
});

// Follow-up email endpoint for incomplete candidate applications
app.post("/api/admin/sessions/:id/send-followup", adminFollowUpLimiter, async (req, res) => {
  const authHeader = req.headers["x-admin-passcode"] as string | undefined;
  if (!verifyAdminAccess(authHeader, res)) return;

  const { id } = req.params;

  try {
    const sessions = await getStoredSessions();
    const session = sessions.find((s) => s.id === id);

    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    const email = session.candidateInfo?.email?.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: "Candidate email is missing or invalid" });
    }

    const transporter = getMailTransporter();
    if (!transporter) {
      return res.status(503).json({
        success: false,
        error: "El servicio de correo no está configurado (EMAIL_USER/EMAIL_PASS).",
      });
    }

    const candidateName = session.candidateInfo?.name || "there";
    const position = session.position || "team member";
    const appUrl = process.env.APP_URL ? process.env.APP_URL.trim() : "";

    const linkParagraph = appUrl
      ? `\n\nYou can resume your application here: ${appUrl}\n`
      : "";

    const mailSubject = `${candidateName}, your Ellianos Coffee application is almost complete!`;
    const mailBody = `Hi ${candidateName},

Thank you for starting your application for the ${position} position at our new Ellianos Coffee location in Lehigh Acres, FL!

We noticed your virtual interview wasn't completed, and we'd love to hear more from you. Your information is saved, so you can pick up right where you left off — it only takes a few minutes.${linkParagraph}
If you have any questions or ran into any issues, just reply to this email and we'll be happy to help.

We hope to hear from you soon!

Warm regards,
The Ellianos Coffee Hiring Team
Lehigh Acres, FL`;

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: mailSubject,
        text: mailBody,
      });
    } catch (mailErr: any) {
      console.error("[Email Follow-up] Failed to dispatch email:", mailErr);
      return res.status(500).json({
        success: false,
        error: mailErr.message || "Failed to send follow-up email.",
      });
    }

    const followUpSentAt = new Date().toISOString();
    const updatedSession = {
      ...session,
      followUpSentAt,
    };

    await upsertSession(updatedSession);
    return res.json({ success: true, followUpSentAt });
  } catch (err: any) {
    console.error("[Admin Follow-up] Internal error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error while sending follow-up.",
    });
  }
});

// Candidate Live Chat Endpoint
app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const { position, history, candidateInfo } = req.body;

    const baseInstruction = `You are an expert AI HR Recruiter for Ellianos Coffee, an Italian Quality at America's Pace double drive-thru coffee franchise. You are hiring for the new Lehigh Acres, FL branch.
The candidate's name is ${candidateInfo?.name || "the candidate"}.

CRITICAL INTERVIEW STRUCTURE (PROGRESSIVE DIFFICULTY):
1. Initial Greeting MUST include constraints: In your VERY FIRST MESSAGE to the candidate, you MUST welcome them and explicitly inform them of the following rules:
   - They can finish and submit the application at ANY TIME by pressing the "Submit" button on their screen.
   - They can also simply tell you in the chat that they want to finish.
   - The full, expected interview consists of a maximum of 25 questions.
2. Start Very Basic: Anyone can apply, so start with very simple, accessible questions (e.g., icebreakers, basic customer service disposition, general interest). Do not assume prior experience.
3. Escalate Gradually: Based on their answers, progressively increase the complexity and depth of your questions to discover their true experience level, skills, and real disposition.
4. Dig Deeper: If they show experience, ask advanced questions. If they are beginners, focus on attitude, willingness to learn, and basic logic.
5. One Question at a Time: NEVER ask multiple questions at once. Wait for their response before moving on. Maximum 25 questions total.

KEY TOPICS TO COVER (Integrate these naturally as the difficulty scales):
- The model is a 800 sq ft double drive-thru. Very tight space, high volume, extreme speed required.
- Confirm reliable transportation and strict schedule adherence (lean staffing means a single absence is devastating).
- If a candidate gives a generic answer (e.g. "I work well under pressure"), dynamically probe for a specific example.
- Peak Difficulty: For ALL roles, before concluding, you MUST present this specific crisis scenario: "You are operating window A's espresso station. Through the headset, an order for window B comes in with three complex Lotus Edge energy drinks and two hot grits bowls. Simultaneously, the car in front of you honks asking for napkins. Walk me through your exact thought process to prioritize these tasks."
- Early Termination: If the candidate states they want to finish or submit early, gracefully conclude the interview, thank them, and instruct them to click the 'Submit' button on their screen.

TONE: Professional, welcoming, and encouraging, yet rigorous. Guide them from basic to deep gracefully.`;

    let roleInstruction = "";
    if (position === "Barista") {
      roleInstruction = `Position: Barista. Focus: Evaluate positive attitude, physical resilience (standing for hours, lifting up to 30 lbs), and extreme multitasking memory. Remember: anyone can apply and previous experience is NOT required. Frame questions to find out their natural disposition before testing their limits.`;
    } else if (position === "Shift Leader") {
      roleInstruction = `Position: Shift Leader. Focus: Evaluate quick problem solving, workflow management, and empathetic leadership. Start with basic team dynamics before moving to complex scenarios (e.g., equipment failure during peak hours, cash discrepancies).`;
    } else if (position === "Store Manager") {
      roleInstruction = `Position: Store Manager. Focus: Evaluate business acumen (P&L, inventory), organizational maturity, and hands-on leadership. Start with basic leadership philosophy before probing deep into P&L, waste reduction, and fair scheduling.`;
    }

    const systemInstruction = `${baseInstruction}\n\n${roleInstruction}\n\nFormat your responses clearly. You are speaking directly to the candidate.`;

    let responseText = "";
    try {
      const response = await generateContentWithInfiniteResilience({
        contents: history,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });
      responseText = response?.text || "";
    } catch (genError) {
      console.warn("[AI Engine] Cloud generation quota exceeded. Engaging high-accuracy local interview generator:", genError);
      responseText = generateLocalInterviewResponse(position, history, candidateInfo);
    }

    res.json({ text: responseText || generateLocalInterviewResponse(position, history, candidateInfo) });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const { position, history, candidateInfo } = req.body || {};
    const fallbackText = generateLocalInterviewResponse(position || "Barista", history || [], candidateInfo || {});
    res.json({ text: fallbackText });
  }
});

// Candidate Evaluation and Final Submission Endpoint
app.post("/api/evaluate-and-send", evaluateLimiter, async (req, res) => {
  try {
    const { session } = req.body;
    if (!session || !session.candidateInfo || !session.id) {
      return res.status(400).json({ success: false, error: "Invalid session data received." });
    }

    const { position, candidateInfo, messages } = session;

    if (!Array.isArray(messages) || messages.length > 200) {
      return res.status(400).json({ success: false, error: "Invalid session messages payload" });
    }

    let evaluationText = "";
    try {
      const userResponses = (messages || []).filter((m: any) => m.role === "user");
      const metricsSummary = userResponses
        .map((m: any, idx: number) => {
          const text = m.parts?.[0]?.text || "";
          const metrics = m.metrics;
          if (!metrics) {
            return `Response ${idx + 1} (${text.length} chars): [No typing metrics recorded]`;
          }
          const durSec = ((metrics.typingDurationMs || 0) / 1000).toFixed(1);
          const delaySec = ((metrics.responseDelayMs || 0) / 1000).toFixed(1);
          const conf = typeof metrics.humanConfidence === "number"
            ? metrics.humanConfidence
            : humanConfidence(metrics, text.length);
          const confStr = conf !== null ? `${conf}%` : "N/A";
          const warnedStr = metrics.lowConfidenceWarned ? ", Candidate Warned: Yes" : "";
          return `Response ${idx + 1} (${text.length} chars): Human-authorship confidence: ${confStr}, WPM: ${metrics.wpm || 0}, Duration: ${durSec}s, Paste Attempts: ${metrics.pasteAttempts || 0}, Max Insert Chunk: ${metrics.maxInsertChunk || 0}, Tab Switches: ${metrics.tabSwitches || 0}, Response Delay: ${delaySec}s, Keystrokes: ${metrics.keystrokes || 0}${warnedStr}`;
        })
        .join("\n");

      const prompt = `You are a Senior HR Manager reviewing an interview transcript for the position of ${position} at Ellianos Coffee.
Candidate Name: ${candidateInfo.name}
Phone: ${candidateInfo.phone}
Email: ${candidateInfo.email}

Below is the interview transcript and the candidate's typing metrics summary. 
Review it carefully and provide a final evaluation of the candidate in clear Markdown format.

You must include:
1. A final score from 0 to 100 based on how well they fit the role's requirements (resilience, logic under pressure, attitude, etc.).
2. A summary of their strengths.
3. A summary of their weaknesses or areas of concern.
4. A final recommendation (Hire, Do Not Hire, or Second Interview).
5. AUTHENTICITY ASSESSMENT: For each response you are given a computed human-authorship confidence percentage (from typing behavior). In the 'Authenticity Signals' section, report: the average confidence, the lowest-confidence answer (number and percentage), and whether the writing-style analysis agrees or disagrees with these numbers. Answers below 35% should be explicitly listed. Remember: these are signals for follow-up, never automatic rejection. Consider: paste attempts, unusually high WPM (>80 sustained), large single-event text insertions, tab switches right before polished answers, very short response delays for long complex answers, and abrupt style/register shifts between answers. Non-native English speakers may write formally; do not flag formal writing alone. Never lower the candidate's score solely because of authenticity signals — report them separately.

Candidate Typing Metrics per Response:
${metricsSummary || "No typing telemetry available."}

Transcript:
${(messages || []).map((m: any) => `[${(m.role || "USER").toUpperCase()}]: ${m.parts?.[0]?.text || ""}`).join("\n\n")}
`;

      const response = await generateContentWithInfiniteResilience({
        contents: prompt,
        config: {
          temperature: 0.2,
        },
      });
      evaluationText = response?.text || "";
    } catch (evalError) {
      console.warn("[AI Engine] Cloud evaluation quota exceeded. Using honest fallback evaluation:", evalError);
      evaluationText = generateLocalEvaluation(session);
    }

    if (!evaluationText) {
      evaluationText = generateLocalEvaluation(session);
    }

    // Send the email if SMTP credentials are configured (non-blocking)
    let emailSent = false;
    const transporter = getMailTransporter();
    if (transporter) {
      try {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: "accounting@jjpartnersco.com",
          subject: `New Interview Application: ${candidateInfo.name} - ${position}`,
          text: `Candidate: ${candidateInfo.name}\nEmail: ${candidateInfo.email}\nPhone: ${candidateInfo.phone}\nPosition: ${position}\n\n=== AI EVALUATION ===\n${evaluationText}\n\n=== TRANSCRIPT ===\n${(messages || []).map((m: any) => `[${(m.role || "USER").toUpperCase()}]: ${m.parts?.[0]?.text || ""}`).join("\n\n")}`,
        };

        await transporter.sendMail(mailOptions);
        emailSent = true;
        console.log(`[Email Service] Evaluation email dispatched successfully for candidate: ${candidateInfo.name}`);
      } catch (mailErr: any) {
        console.warn(`[Email Service] Email delivery skipped/failed: ${mailErr.message || mailErr}`);
      }
    }

    // Persist completed evaluation and updated session
    try {
      await upsertSession({
        ...session,
        status: "Completed",
        evaluation: evaluationText,
        emailSent,
      });
    } catch (saveErr) {
      console.warn("[Storage] Failed to persist completed session:", saveErr);
    }

    res.json({ success: true, evaluation: evaluationText, emailSent });
  } catch (error: any) {
    console.error("Error evaluating application:", error);
    res.status(500).json({ success: false, error: error.message || "An error occurred during evaluation." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
