import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { Firestore } from "@google-cloud/firestore";
import { humanConfidence } from "./src/authenticity";
import { SecondInterviewGuide, SecondInterviewScores } from "./src/types";

dotenv.config();

const app = express();
app.set("trust proxy", true);

// Protect endpoints with payload size limits
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSCODE = (process.env.ADMIN_PASSCODE || "ellianos2024").trim();

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

const adminVerifyLimiter = createRateLimiter(15 * 60 * 1000, 15, "Demasiados intentos fallidos. Por favor espere unos minutos.");
const chatLimiter = createRateLimiter(60 * 1000, 30, "Too many chat requests. Please slow down.");
const sessionSyncLimiter = createRateLimiter(60 * 1000, 60, "Too many sync requests. Please slow down.");
const evaluateLimiter = createRateLimiter(10 * 60 * 1000, 5, "Too many evaluation requests. Please wait before submitting again.");
const adminFollowUpLimiter = createRateLimiter(60 * 60 * 1000, 10, "Too many follow-up emails sent. Please try again later (maximum 10 per hour).");
const secondInterviewGuideLimiter = createRateLimiter(60 * 60 * 1000, 10, "Demasiadas solicitudes de generación de guía. Por favor intente más tarde.");
const findIncompleteLimiter = createRateLimiter(15 * 60 * 1000, 10, "Too many search requests. Please try again in 15 minutes.");

// Centralized admin authentication verification helper
function verifyAdminAccess(provided: string | undefined, res: express.Response): boolean {
  const cleanProvided = (provided || "").trim();
  if (!cleanProvided || cleanProvided !== ADMIN_PASSCODE) {
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

// Load firebase config if available
let firebaseConfig: any = null;
try {
  if (fs.existsSync(path.join(process.cwd(), "firebase-applet-config.json"))) {
    firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf-8"));
  }
} catch (e) {
  console.warn("[Storage] Could not read firebase-applet-config.json:", e);
}

// Initialize Firestore for durable Cloud persistence across all environments
let firestoreClient: Firestore | null = null;
try {
  const options: any = {};
  if (firebaseConfig?.projectId) {
    options.projectId = firebaseConfig.projectId;
  }
  if (firebaseConfig?.firestoreDatabaseId) {
    options.databaseId = firebaseConfig.firestoreDatabaseId;
  }
  firestoreClient = new Firestore(options);
  console.log(`[Storage] Initialized Cloud Firestore persistence (Project: ${firebaseConfig?.projectId || 'default'}, DB: ${firebaseConfig?.firestoreDatabaseId || '(default)'})`);
} catch (fsErr) {
  console.warn("[Storage] Could not initialize Firestore client, fallback to local storage:", fsErr);
  firestoreClient = null;
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

// Unified Async Storage layer (Firestore with automatic Local Fallback & Two-way sync)
async function syncLocalToFirestoreIfEmpty() {
  if (!firestoreClient) return;
  try {
    const snapshot = await firestoreClient.collection("interviews").limit(1).get();
    if (snapshot.empty) {
      const local = getLocalSessions();
      if (local.length > 0) {
        console.log(`[Storage] Seeding ${local.length} existing local interviews to Cloud Firestore...`);
        for (const item of local) {
          await firestoreClient.collection("interviews").doc(item.id).set(item, { merge: true });
        }
        console.log("[Storage] Cloud Firestore seeded successfully.");
      }
    }
  } catch (e) {
    console.warn("[Storage] Cloud Firestore initial check:", e);
  }
}
syncLocalToFirestoreIfEmpty();

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
      console.warn("[Storage] Firestore read error, using local file storage:", fsErr);
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

  // Always keep local disk in sync as fallback
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

  // Write to Cloud Firestore
  if (firestoreClient) {
    try {
      await firestoreClient.collection("interviews").doc(safeSession.id).set(safeSession, { merge: true });
    } catch (fsErr) {
      console.warn("[Storage] Firestore write error:", fsErr);
    }
  }
}

async function deleteStoredSession(id: string): Promise<number> {
  let sessions = getLocalSessions();
  sessions = sessions.filter((s) => s.id !== id);
  saveLocalSessions(sessions);

  if (firestoreClient) {
    try {
      await firestoreClient.collection("interviews").doc(id).delete();
      const snapshot = await firestoreClient.collection("interviews").count().get();
      return snapshot.data().count;
    } catch (fsErr) {
      console.warn("[Storage] Firestore delete error:", fsErr);
    }
  }

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
  const timeoutMs = request.timeoutMs || 25000;

  for (const model of modelsToTry) {
    const currentRequest = { ...request, model };
    delete currentRequest.timeoutMs;

    try {
      console.log(`[AI Engine] Dispatching request with model: ${model}`);
      
      const requestPromise = ai.models.generateContent(currentRequest);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${model} exceeded ${timeoutMs}ms response window`)), timeoutMs)
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

function formatGuideAsPlainText(guide: SecondInterviewGuide): string {
  let out = `=== GUÍA PARA SEGUNDA ENTREVISTA ===\n\n`;
  out += `PUNTOS DE ENFOQUE A VERIFICAR:\n`;
  (guide.focusPoints || []).forEach((pt, i) => {
    out += `${i + 1}. ${pt}\n`;
  });
  out += `\nCONSEJOS PARA EL ENTREVISTADOR:\n`;
  (guide.interviewerTips || []).forEach((tip) => {
    out += `* ${tip}\n`;
  });
  const totalMins = (guide.blocks || []).reduce((acc, b) => acc + (b.minutes || 0), 0);
  out += `\nBLOQUES DE LA ENTREVISTA (${totalMins} MINUTOS TOTAL):\n`;
  (guide.blocks || []).forEach((block, bIdx) => {
    out += `\n------------------------------------------------------------\n`;
    out += `BLOQUE ${bIdx + 1}: ${block.title.toUpperCase()} (${block.minutes} min) ${block.mustPass ? "[ELIMINATORIO / MUST PASS]" : "[FORMATIVO / OP]"}\n`;
    out += `Objetivo: ${block.goal}\n\n`;
    const bQuestions = (guide.questions || []).filter((q) => (block.questionIds || []).includes(q.id));
    bQuestions.forEach((q, qIdx) => {
      out += `Pregunta ${bIdx + 1}.${qIdx + 1} [${(q.language || "es").toUpperCase()}]: "${q.text}"\n`;
      out += `  - Propósito: ${q.purpose}\n`;
      out += `  - Escuchar (Buena señal): ${(q.listenFor || []).join("; ")}\n`;
      out += `  - Alertas (Red Flags): ${(q.redFlags || []).join("; ")}\n\n`;
    });
  });
  out += `------------------------------------------------------------\n`;
  out += `CRITERIOS DE DECISIÓN:\n`;
  out += `* Contratar: ${guide.decision?.hire || "N/A"}\n`;
  out += `* Tercera Conversación: ${guide.decision?.thirdConversation || "N/A"}\n`;
  out += `* Declinar: ${guide.decision?.decline || "N/A"}\n`;
  return out;
}

async function generateSecondInterviewGuide(session: any): Promise<SecondInterviewGuide> {
  const { position, candidateInfo, messages, evaluation } = session;
  const candidateName = candidateInfo?.name || "Candidato";
  const userResponses = (messages || []).filter((m: any) => m.role === "user");

  // Determine candidate language
  const allUserText = userResponses.map((m: any) => m.parts?.[0]?.text || "").join(" ").toLowerCase();
  const spanishKeywords = [
    "hola", "gracias", "experiencia", "trabajo", "cuando", "bueno", "para", "los", "las",
    "por", "que", "estoy", "tengo", "cliente", "café", "cafe", "turno", "horas", "si",
    "sí", "puedo", "hacer", "años", "servicio", "presión", "equipo", "líder", "gerente"
  ];
  let spanishHits = 0;
  for (const word of spanishKeywords) {
    const reg = new RegExp(`\\b${word}\\b`, "gi");
    const matches = allUserText.match(reg);
    if (matches) spanishHits += matches.length;
  }
  const isSpanishSpeaker = spanishHits >= 4 || (userResponses.length > 0 && (spanishHits / userResponses.length) >= 0.4);

  // Authenticity telemetry summary
  const metricsSummary = userResponses
    .map((m: any, idx: number) => {
      const text = m.parts?.[0]?.text || "";
      const metrics = m.metrics;
      if (!metrics) {
        return `Respuesta ${idx + 1} (${text.length} caracteres): [Sin telemetría de tecleo]`;
      }
      const durSec = ((metrics.typingDurationMs || 0) / 1000).toFixed(1);
      const delaySec = ((metrics.responseDelayMs || 0) / 1000).toFixed(1);
      const conf = typeof metrics.humanConfidence === "number"
        ? metrics.humanConfidence
        : humanConfidence(metrics, text.length);
      const confStr = conf !== null ? `${conf}%` : "N/A";
      const warnedStr = metrics.lowConfidenceWarned ? ", Candidato advertido: Sí" : "";
      return `Respuesta ${idx + 1} (${text.length} chars): Confianza humana: ${confStr}, WPM: ${metrics.wpm || 0}, Duración: ${durSec}s, Intentos de pegado: ${metrics.pasteAttempts || 0}, Max Insert: ${metrics.maxInsertChunk || 0}, Cambios de pestaña: ${metrics.tabSwitches || 0}, Tiempo de respuesta: ${delaySec}s, Teclas: ${metrics.keystrokes || 0}${warnedStr}`;
    })
    .join("\n");

  const lowConfidenceAnswers = userResponses.filter((m: any) => {
    const textLen = m.parts?.[0]?.text?.length || 0;
    const conf = m.metrics?.humanConfidence ?? (m.metrics ? humanConfidence(m.metrics, textLen) : null);
    return conf !== null && conf < 70;
  });

  const prompt = `Eres un Director Senior de Recursos Humanos y Operaciones de Ellianos Coffee.
Tu tarea es generar una GUÍA PERSONALIZADA PARA LA SEGUNDA ENTREVISTA PRESENCIAL para el candidato: ${candidateName} (Puesto: ${position || "Barista"}).

=== CONTEXTO DE LA EMPRESA ===
Ellianos Coffee: Modelo de kiosco de doble carril drive-thru de 800 sq ft, altísima velocidad ("Italian Quality at America's Pace"), 4 a 6 personas por turno en espacio reducido, aperturas de madrugada (desde 4:30 AM), y apertura de nueva tienda en octubre en Lehigh Acres, FL.

=== DATOS DEL CANDIDATO ===
Nombre: ${candidateName}
Teléfono: ${candidateInfo?.phone || "No especificado"}
Email: ${candidateInfo?.email || "No especificado"}
Idioma predominante en su entrevista virtual: ${isSpanishSpeaker ? "Español" : "Inglés"}

=== EVALUACIÓN PREVIA DE IA ===
${evaluation || "Sin evaluación previa registrada."}

=== MÉTRICAS DE TELEMETRÍA Y AUTENTICIDAD DE ESCRITURA ===
${metricsSummary || "Sin telemetría disponible."}
${lowConfidenceAnswers.length > 0 ? `NOTA: Hubo ${lowConfidenceAnswers.length} respuesta(s) con confianza de autoría humana < 70% o alertas de pegado/baja confianza.` : ""}

=== TRANSCRIPCIÓN DE LA ENTREVISTA VIRTUAL ===
${(messages || []).map((m: any) => `[${(m.role || "USER").toUpperCase()}]: ${m.parts?.[0]?.text || ""}`).join("\n\n")}

=== INSTRUCCIONES CRÍTICAS PARA LA GUÍA ===
Genera un objeto JSON que cumpla EXACTAMENTE con el siguiente esquema:
{
  "focusPoints": ["3 a 4 frases concisas con los puntos neurálgicos a verificar en este candidato específico."],
  "interviewerTips": ["3 reglas prácticas y concisas para el entrevistador de RRHH (ej: pedir el caso concreto y números, no acusar sobre IA/asistencia, evaluar ritmo y actitud en vivo)."],
  "blocks": [
    {
      "id": "block_1",
      "title": "Nombre del bloque",
      "goal": "Objetivo del bloque",
      "minutes": 10,
      "mustPass": true,
      "questionIds": ["q1", "q2"]
    }
  ],
  "questions": [
    {
      "id": "q1",
      "block": "block_1",
      "text": "Texto de la pregunta",
      "language": "es",
      "purpose": "Una sola frase que explica qué verifica exactamente esta pregunta.",
      "listenFor": ["2 o 3 señales positivas concretas que el entrevistador debe escuchar"],
      "redFlags": ["2 o 3 señales de alerta o respuestas evasivas"]
    }
  ],
  "decision": {
    "hire": "Criterio claro de contratación basado en bloques (ej: Bloques must-pass >= 4.0 y bloque de inglés >= 3.0)",
    "thirdConversation": "Criterio para tercera conversación o zona gris",
    "decline": "Criterio de descarte (ej: Cualquier bloque must-pass <= 2.0 o inconsistencias graves)"
  }
}

REGLAS DE CONTENIDO:
1. IDIOMA: La guía es para el entrevistador de RRHH de Ellianos, redactada en español. Las preguntas deben estar en español (language: "es"), EXCEPTO un bloque dedicado a la verificación de inglés funcional (preguntas formuladas en inglés, language: "en"), el cual es OBLIGATORIO si el candidato respondió en español (${isSpanishSpeaker ? "SÍ - es obligatorio incluir bloque de inglés" : "opcional/breve si ya demostró inglés fluido"}).
2. ESTRUCTURA: Entre 4 y 5 bloques temáticos, 2 a 4 preguntas por bloque, sumando entre 45 y 60 minutos en total.
   - Bloques sugeridos según el caso:
     * Experiencia Real Verificable (mustPass: true)
     * Conocimiento Operativo & Resistencia bajo Presión (mustPass: true)
     * Inglés Funcional para Atención al Cliente (language: "en") (${isSpanishSpeaker ? "mustPass: true" : "mustPass: false"})
     * Adaptación al Modelo Ellianos (800 ft², drive-thru doble, aperturas de madrugada, apertura tienda Lehigh Acres en octubre)
     * Cierre, Honestidad y Compromiso
   - Marca mustPass: true en los bloques que son eliminatorios.
3. ANCLAJE OBLIGATORIO EN SU TRANSCRIPCIÓN:
   - Cita textualmente afirmaciones que el candidato hizo por escrito: "Por escrito mencionaste que [CITA] — cuéntame un caso real donde ocurrió: qué hiciste tú exactamente y cuál fue el resultado numérico/operativo".
   - Cada debilidad identificada en la evaluación debe tener al menos una pregunta que la explore a fondo.
   - Cada fortaleza afirmada sin evidencia en la entrevista previa debe tener una pregunta que indague detalles que solo alguien que lo vivió conoce (procedimientos, tiempos, herramientas, volúmenes).
4. SEÑALES DE AUTENTICIDAD:
   - Si hubo respuestas con confianza < 70% o pegados de texto, formula preguntas orales profundas sobre esos mismos conceptos para verificar si el conocimiento es genuino.
   - En el bloque de cierre, incluye una pregunta neutral sobre si se apoyó en herramientas o IA para redactar (enfatizando que la honestidad cuenta a favor, sin acusar).
5. VALIDACIÓN:
   - Cada pregunta debe tener un id único (ej: "q1", "q2", ...).
   - Cada block.questionIds debe contener exactamente los IDs de las preguntas de ese bloque.
   - Devuelve ÚNICAMENTE el JSON válido, sin texto introductorio ni markdown adicional.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await generateContentWithInfiniteResilience({
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const rawText = response?.text || "";
      const cleanedText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed: any = JSON.parse(cleanedText);

      if (!parsed || typeof parsed !== "object") throw new Error("Parsed JSON is not an object");
      if (!Array.isArray(parsed.focusPoints) || parsed.focusPoints.length < 2) throw new Error("focusPoints must have at least 2 items");
      if (!Array.isArray(parsed.interviewerTips) || parsed.interviewerTips.length < 2) throw new Error("interviewerTips must have at least 2 items");
      if (!Array.isArray(parsed.blocks) || parsed.blocks.length < 3) throw new Error("blocks must have at least 3 blocks");
      if (!Array.isArray(parsed.questions) || parsed.questions.length < 5) throw new Error("questions must have at least 5 questions");
      if (!parsed.decision || typeof parsed.decision.hire !== "string" || typeof parsed.decision.decline !== "string") {
        throw new Error("decision criteria missing hire/decline");
      }

      const qMap = new Map<string, any>();
      for (const q of parsed.questions) {
        if (!q.id || !q.text || !q.purpose) throw new Error(`Invalid question format: ${JSON.stringify(q)}`);
        if (qMap.has(q.id)) throw new Error(`Duplicate question id: ${q.id}`);
        qMap.set(q.id, q);
      }

      for (const b of parsed.blocks) {
        if (!b.id || !b.title || !Array.isArray(b.questionIds) || b.questionIds.length === 0) {
          throw new Error(`Invalid block format: ${JSON.stringify(b)}`);
        }
        for (const qId of b.questionIds) {
          if (!qMap.has(qId)) throw new Error(`Block ${b.id} references missing question ${qId}`);
        }
      }

      const guide: SecondInterviewGuide = {
        generatedAt: new Date().toISOString(),
        focusPoints: parsed.focusPoints,
        interviewerTips: parsed.interviewerTips,
        blocks: parsed.blocks,
        questions: parsed.questions,
        decision: {
          hire: parsed.decision.hire || "",
          thirdConversation: parsed.decision.thirdConversation || "",
          decline: parsed.decision.decline || "",
        },
      };

      return guide;
    } catch (err: any) {
      console.warn(`[SecondInterviewGuide] Generation attempt ${attempt} failed:`, err.message || err);
      if (attempt === 2) {
        throw new Error(`Failed to generate valid Second Interview Guide: ${err.message || "Invalid AI output"}`);
      }
    }
  }

  throw new Error("Failed to generate Second Interview Guide");
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

    // Strip deletedAt and interview guide/scores from candidate sync payload to prevent unauthorized modification
    const {
      deletedAt: _ignoredDeletedAt,
      secondInterviewGuide: _ignoredGuide,
      secondInterviewScores: _ignoredScores,
      ...cleanSession
    } = session;

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

// Second Interview Guide Generation Endpoint
app.post("/api/admin/sessions/:id/second-interview-guide", secondInterviewGuideLimiter, async (req, res) => {
  const authHeader = req.headers["x-admin-passcode"] as string | undefined;
  if (!verifyAdminAccess(authHeader, res)) return;

  const { id } = req.params;
  const { force } = req.body || {};

  try {
    const sessions = await getStoredSessions();
    const session = sessions.find((s) => s.id === id);
    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    if (session.secondInterviewGuide && !force) {
      return res.json({ success: true, guide: session.secondInterviewGuide });
    }

    const guide = await generateSecondInterviewGuide(session);
    
    const updatedSession = {
      ...session,
      secondInterviewGuide: guide,
      secondInterviewScores: force ? undefined : session.secondInterviewScores,
    };
    if (force) {
      delete updatedSession.secondInterviewScores;
    }

    await upsertSession(updatedSession);
    return res.json({ success: true, guide });
  } catch (err: any) {
    console.error("[SecondInterviewGuide] Error generating guide:", err);
    return res.status(503).json({
      success: false,
      error: err.message || "La IA no está disponible ahora; inténtalo más tarde.",
    });
  }
});

// Second Interview Live Scoring and Notes Update Endpoint
app.put("/api/admin/sessions/:id/second-interview-scores", async (req, res) => {
  const authHeader = req.headers["x-admin-passcode"] as string | undefined;
  if (!verifyAdminAccess(authHeader, res)) return;

  const { id } = req.params;
  const { scores, notes } = req.body || {};

  try {
    const sessions = await getStoredSessions();
    const session = sessions.find((s) => s.id === id);
    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    const validQuestionIds = new Set((session.secondInterviewGuide?.questions || []).map((q: any) => q.id));
    const sanitizedScores: Record<string, number> = {};
    if (scores && typeof scores === "object") {
      for (const [qId, val] of Object.entries(scores)) {
        if (typeof val === "number" && Number.isInteger(val) && val >= 1 && val <= 5) {
          if (validQuestionIds.size === 0 || validQuestionIds.has(qId)) {
            sanitizedScores[qId] = val;
          }
        }
      }
    }

    const sanitizedNotes: Record<string, string> = {};
    if (notes && typeof notes === "object") {
      for (const [qId, val] of Object.entries(notes)) {
        if (typeof val === "string") {
          sanitizedNotes[qId] = val.slice(0, 2000);
        }
      }
    }

    const secondInterviewScores: SecondInterviewScores = {
      scores: sanitizedScores,
      notes: sanitizedNotes,
      updatedAt: new Date().toISOString(),
    };

    const updatedSession = {
      ...session,
      secondInterviewScores,
    };

    await upsertSession(updatedSession);
    return res.json({ success: true, scores: secondInterviewScores });
  } catch (err: any) {
    console.error("[SecondInterviewScores] Error saving scores:", err);
    return res.status(500).json({ success: false, error: "Failed to save scores" });
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

    // Auto-generate Second Interview Guide if recommendation suggests second interview
    let generatedGuide: SecondInterviewGuide | null = null;
    const isSecondInterviewRecommended = /second\s*interview/i.test(evaluationText);
    if (isSecondInterviewRecommended) {
      try {
        console.log(`[Evaluate] Second interview recommended for ${candidateInfo.name}. Auto-generating guide...`);
        generatedGuide = await generateSecondInterviewGuide({
          ...session,
          evaluation: evaluationText,
        });
      } catch (guideErr) {
        console.warn("[Evaluate] Non-blocking second interview guide auto-generation failed:", guideErr);
      }
    }

    // Send the email if SMTP credentials are configured (non-blocking)
    let emailSent = false;
    const transporter = getMailTransporter();
    if (transporter) {
      try {
        const guideSection = generatedGuide ? `\n\n${formatGuideAsPlainText(generatedGuide)}` : "";
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: "accounting@jjpartnersco.com",
          subject: `New Interview Application: ${candidateInfo.name} - ${position}`,
          text: `Candidate: ${candidateInfo.name}\nEmail: ${candidateInfo.email}\nPhone: ${candidateInfo.phone}\nPosition: ${position}\n\n=== AI EVALUATION ===\n${evaluationText}${guideSection}\n\n=== TRANSCRIPT ===\n${(messages || []).map((m: any) => `[${(m.role || "USER").toUpperCase()}]: ${m.parts?.[0]?.text || ""}`).join("\n\n")}`,
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
        secondInterviewGuide: generatedGuide || session.secondInterviewGuide,
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
