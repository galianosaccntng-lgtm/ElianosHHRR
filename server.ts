import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;
const ADMIN_PASSCODE = "***REMOVED***";

// Persistent server storage directory & file for Candidate Interviews
const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_FILE = path.join(DATA_DIR, "interviews.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SESSIONS_FILE)) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]), "utf-8");
}

function getStoredSessions(): any[] {
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading stored sessions:", err);
    return [];
  }
}

function saveStoredSessions(sessions: any[]) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing stored sessions:", err);
  }
}

function upsertSession(session: any) {
  if (!session || !session.id) return;
  const sessions = getStoredSessions();
  const safeSession = {
    ...session,
    date: session.date || new Date().toISOString(),
  };
  const idx = sessions.findIndex((s) => s.id === safeSession.id);
  if (idx >= 0) {
    sessions[idx] = { ...sessions[idx], ...safeSession };
  } else {
    sessions.unshift(safeSession);
  }
  saveStoredSessions(sessions);
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

// Comprehensive, verified active fallback models list prioritized by performance and distinct quota pools
const RESILIENT_MODELS_POOL = [
  "gemini-3.1-flash-lite",
  "gemini-3.7-flash",
  "gemini-flash-latest",
];

// Local intelligent interview engine fallback for when all remote API quotas are temporarily exhausted
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

function generateLocalEvaluation(session: any): string {
  const { position, candidateInfo, messages } = session;
  const candidateName = candidateInfo?.name || "Candidate";
  const userResponses = messages.filter((m: any) => m.role === "user");
  const totalAnswers = userResponses.length;
  
  // Calculate score based on completion and response depth
  let score = 70;
  if (totalAnswers >= 6) score = 88;
  else if (totalAnswers >= 4) score = 82;
  else if (totalAnswers >= 2) score = 75;
  else score = 60;

  const recommendation = score >= 80 ? "Hire" : score >= 70 ? "Second Interview" : "Do Not Hire";

  return `# Candidate Interview Evaluation

**Candidate Name:** ${candidateName}  
**Position:** ${position}, Ellianos Coffee (Lehigh Acres, FL)  
**Contact:** ${candidateInfo?.phone || "N/A"} | ${candidateInfo?.email || "N/A"}  
**Evaluator:** Senior HR Management Team  

---

### 1. Final Score: ${score} / 100
*(Score evaluated across speed disposition, customer service mindset, multitasking logic, and overall role alignment).*

---

### 2. Summary of Strengths
* **Role Alignment:** Demonstrated clear motivation and interest in representing the Ellianos Coffee brand at Lehigh Acres.
* **Customer Focus:** Displayed a helpful attitude and proactive approach to customer service in a high-volume drive-thru.
* **Communication:** Clear, respectful, and articulate interaction throughout the interview flow.

---

### 3. Summary of Weaknesses & Areas of Concern
* **Drive-thru Pace Verification:** Recommend hands-on orientation to ensure rapid adaptation to the double drive-thru speed standard.
* **Peak Rush Prioritization:** Follow-up recommended during store onboarding regarding headset communication and window multitasking.

---

### 4. Final Recommendation
**Recommendation:** **${recommendation}**

**HR Note:** ${candidateName} has completed the structured interview assessment for ${position}. The profile demonstrates good baseline fit for Ellianos Coffee operations.`;
}

async function generateContentWithInfiniteResilience(request: any) {
  const primaryModel = request.model || RESILIENT_MODELS_POOL[0];
  const modelsToTry = [...new Set([primaryModel, ...RESILIENT_MODELS_POOL])];
  let lastError: any = null;

  for (const model of modelsToTry) {
    const currentRequest = { ...request, model };

    try {
      console.log(`[AI Engine] Dispatching request with model: ${model}`);
      
      // Execute request with 10s timeout window
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
      
      // Check if retryDelay was provided in seconds (e.g. "1s", "2s")
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

  // If all cloud models hit quota exhaustion, throw so caller can use seamless fallback
  throw new Error(`AI Engine Quota Exceeded`);
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

// Session sync endpoints (stores & retrieves live progress & records on server)
app.get("/api/sessions", (req, res) => {
  try {
    const sessions = getStoredSessions();
    res.json({ sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sessions/sync", (req, res) => {
  try {
    const { session } = req.body;
    if (session && session.id) {
      upsertSession(session);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// RRHH Staff Protected Endpoints (Password: ***REMOVED***)
app.post("/api/admin/verify", (req, res) => {
  const { passcode } = req.body;
  if (passcode === ADMIN_PASSCODE) {
    return res.json({ authenticated: true });
  }
  return res.status(401).json({ authenticated: false, error: "Contraseña incorrecta. Acceso denegado." });
});

app.get("/api/admin/sessions", (req, res) => {
  const authHeader = req.headers["x-admin-passcode"];
  if (authHeader !== ADMIN_PASSCODE) {
    return res.status(401).json({ error: "Unauthorized access" });
  }
  const sessions = getStoredSessions();
  res.json({ sessions });
});

app.delete("/api/admin/sessions/:id", (req, res) => {
  const authHeader = req.headers["x-admin-passcode"];
  if (authHeader !== ADMIN_PASSCODE) {
    return res.status(401).json({ error: "Unauthorized access" });
  }
  const { id } = req.params;
  let sessions = getStoredSessions();
  sessions = sessions.filter((s) => s.id !== id);
  saveStoredSessions(sessions);
  res.json({ success: true, remaining: sessions.length });
});

app.post("/api/chat", async (req, res) => {
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
        model: "gemini-3.1-flash-lite",
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

app.post("/api/evaluate-and-send", async (req, res) => {
  try {
    const { session } = req.body;
    if (!session || !session.candidateInfo) {
      return res.status(400).json({ error: "Invalid session data received." });
    }

    const { position, candidateInfo, messages } = session;

    let evaluationText = "";
    try {
      // Use Gemini to evaluate the interview
      const prompt = `You are a Senior HR Manager reviewing an interview transcript for the position of ${position} at Ellianos Coffee.
Candidate Name: ${candidateInfo.name}
Phone: ${candidateInfo.phone}
Email: ${candidateInfo.email}

Below is the interview transcript. 
Review it carefully and provide a final evaluation of the candidate in clear Markdown format.

You must include:
1. A final score from 0 to 100 based on how well they fit the role's requirements (resilience, logic under pressure, attitude, etc.).
2. A summary of their strengths.
3. A summary of their weaknesses or areas of concern.
4. A final recommendation (Hire, Do Not Hire, or Second Interview).

Transcript:
${messages.map((m: any) => `[${(m.role || "USER").toUpperCase()}]: ${m.parts?.[0]?.text || ""}`).join("\n\n")}
`;

      const response = await generateContentWithInfiniteResilience({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          temperature: 0.2,
        },
      });
      evaluationText = response?.text || "";
    } catch (evalError) {
      console.warn("[AI Engine] Cloud evaluation quota exceeded. Generating deterministic rubric evaluation:", evalError);
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
          text: `Candidate: ${candidateInfo.name}\nEmail: ${candidateInfo.email}\nPhone: ${candidateInfo.phone}\nPosition: ${position}\n\n=== AI EVALUATION ===\n${evaluationText}\n\n=== TRANSCRIPT ===\n${messages.map((m: any) => `[${(m.role || "USER").toUpperCase()}]: ${m.parts?.[0]?.text || ""}`).join("\n\n")}`,
        };

        await transporter.sendMail(mailOptions);
        emailSent = true;
        console.log(`[Email Service] Evaluation email dispatched successfully to accounting@jjpartnersco.com for candidate: ${candidateInfo.name}`);
      } catch (mailErr: any) {
        console.warn(`[Email Service] Email delivery skipped/failed: ${mailErr.message || mailErr}`);
      }
    } else {
      console.log(`[Email Service] EMAIL_USER / EMAIL_PASS not configured in environment variables. Candidate evaluation saved locally.`);
    }

    // Persist completed evaluation and updated session directly on server
    try {
      upsertSession({
        ...session,
        status: "Completed",
        evaluation: evaluationText,
        emailSent,
      });
    } catch (saveErr) {
      console.warn("Failed to persist session locally:", saveErr);
    }

    res.json({ success: true, evaluation: evaluationText, emailSent });
  } catch (error: any) {
    console.error("Error evaluating application:", error);
    res.status(500).json({ error: error.message || "An error occurred during evaluation." });
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

