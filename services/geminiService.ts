import { GoogleGenAI, Type } from "@google/genai";
import { AgentRole, Task, AgentPrompts } from "../types";

// --- API CONFIGURATION ---

const parseKeyList = (raw?: string): string[] =>
  raw
    ?.split(",")
    .map((key) => key.trim())
    .filter(Boolean) || [];

// Role-specific keys take precedence; fallback to shared pool (comma-separated).
const roleScopedKeys: Record<AgentRole, string | undefined> = {
  [AgentRole.SUPERVISOR]: import.meta.env.VITE_GEMINI_API_KEY_SUPERVISOR,
  [AgentRole.CODER]: import.meta.env.VITE_GEMINI_API_KEY_CODER,
  [AgentRole.WRITER]: import.meta.env.VITE_GEMINI_API_KEY_WRITER,
  [AgentRole.RESEARCHER]: import.meta.env.VITE_GEMINI_API_KEY_RESEARCHER,
  [AgentRole.ANALYST]: import.meta.env.VITE_GEMINI_API_KEY_ANALYST,
  [AgentRole.EDITOR]: import.meta.env.VITE_GEMINI_API_KEY_EDITOR,
};

const sharedKeys = [
  import.meta.env.VITE_GEMINI_API_KEY,
  ...parseKeyList(import.meta.env.VITE_GEMINI_API_KEYS),
].filter(Boolean);

const API_KEYS: Record<AgentRole, string> = {
  [AgentRole.SUPERVISOR]: roleScopedKeys[AgentRole.SUPERVISOR] || sharedKeys[0] || "",
  [AgentRole.CODER]: roleScopedKeys[AgentRole.CODER] || sharedKeys[0] || "",
  [AgentRole.WRITER]: roleScopedKeys[AgentRole.WRITER] || sharedKeys[0] || "",
  [AgentRole.RESEARCHER]: roleScopedKeys[AgentRole.RESEARCHER] || sharedKeys[0] || "",
  [AgentRole.ANALYST]: roleScopedKeys[AgentRole.ANALYST] || sharedKeys[0] || "",
  [AgentRole.EDITOR]: roleScopedKeys[AgentRole.EDITOR] || sharedKeys[0] || "",
};

const keyPool = Array.from(
  new Set([
    ...Object.values(API_KEYS),
    ...sharedKeys,
  ].filter(Boolean))
);

if (keyPool.length === 0) {
  throw new Error(
    "No Gemini API keys configured. Set VITE_GEMINI_API_KEY, VITE_GEMINI_API_KEYS (comma-separated), or role-specific VITE_GEMINI_API_KEY_<ROLE> values in your .env file."
  );
}

// --- ROBUST API CALLER ---

/**
 * Executes a Gemini API call with automatic key rotation on 429/5xx errors.
 * 
 * Strategy:
 * 1. Try the Agent's specific assigned key first.
 * 2. If it fails with Quota (429) or Server (5xx) error, try ALL other keys in the pool.
 * 3. If a 400-level error (Bad Request) occurs, throw immediately (retrying won't fix bad prompts).
 */
const generateContentWithFallback = async (
    params: {
        model: string, 
        contents: any, 
        config?: any
    }, 
    preferredRole: AgentRole
): Promise<any> => {
    // 1. Determine Key Priority
    const primaryKey = API_KEYS[preferredRole] || keyPool[0];
    const backupKeys = keyPool.filter((k) => k !== primaryKey);
    
    // The order of execution: Primary -> Backup 1 -> Backup 2...
    const executionOrder = [primaryKey, ...backupKeys];

    let lastError: any = null;

    for (const apiKey of executionOrder) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent(params);
            
            // Basic Safety/Recitation Checks
            if (!response.text && response.candidates && response.candidates.length > 0) {
                 const candidate = response.candidates[0];
                 if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
                     // Non-recoverable by switching keys
                     throw new Error(`Content generation blocked: ${candidate.finishReason}`);
                 }
            }
            
            // If we succeed, return immediately
            return response;

        } catch (error: any) {
             const status = error.status || error.code || 500;
             const message = typeof error.message === "string" ? error.message : String(error.message ?? "");
             const text = message || JSON.stringify(error);
             
             const isGlobalQuotaExhausted =
               text.includes("limit: 0") ||
               text.includes("GenerateRequestsPerDayPerProjectPerModel-FreeTier");
             
             if (isGlobalQuotaExhausted) {
                 console.error("[GeminiService] Global project quota exhausted. Not retrying with other keys.");
                 throw error;
             }

             const isQuota =
               status === 429 ||
               text.includes("429") ||
               text.toLowerCase().includes("quota");
             const isServer = status >= 500 && status < 600;
             
             // Only retry on per-key Quota errors or transient Server errors
             if (isQuota || isServer) {
                 const keyMasked = apiKey ? `...${apiKey.slice(-4)}` : "Unknown";
                 console.warn(`[GeminiService] Key ${keyMasked} failed (${status}). Switching to next key...`);
                 lastError = error;
                 continue; // Proceed to next key in loop
             }
             
             // If it's a client error (e.g., 400 Invalid Argument), fail fast.
             console.error(`[GeminiService] Non-retriable error: ${message}`);
             throw error;
        }
    }
    
    // If we exhausted all keys
    throw lastError || new Error("All API keys exhausted or service unavailable.");
};


// --- AGENT FUNCTIONS ---

// 1. Supervisor: Create Initial Plan
export const createSupervisorPlan = async (userQuery: string, prompts: AgentPrompts): Promise<{ tasks: Task[], usage: number, prompt: string }> => {
    const modelId = "gemini-3-flash-preview";
    
    const systemInstruction = prompts[AgentRole.SUPERVISOR];
    const fullPrompt = `${systemInstruction}\n\nUser Request: "${userQuery}"\n\nReturn a JSON array of tasks.`;

    try {
        const response = await generateContentWithFallback({
            model: modelId,
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 4096 },
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            description: { type: Type.STRING },
                            assignedAgent: { 
                                type: Type.STRING, 
                                enum: Object.values(AgentRole)
                            },
                        },
                        required: ["title", "description", "assignedAgent"],
                    }
                }
            }
        }, AgentRole.SUPERVISOR);

        const jsonText = response.text || "[]";
        const tasksRaw = JSON.parse(jsonText);
        const usage = response.usageMetadata?.totalTokenCount || 0;
        
        const tasks = tasksRaw.map((t: any, index: number) => ({
            id: `task-${Date.now()}-${index}`,
            title: t.title,
            description: t.description,
            assignedAgent: t.assignedAgent,
            status: 'pending'
        }));

        return { tasks, usage, prompt: fullPrompt };

    } catch (error) {
        console.error("Plan creation failed:", error);
        throw error;
    }
};

// 2. Supervisor: Update Plan (Replanning)
export const updateSupervisorPlan = async (
    userQuery: string,
    completedTasks: Task[],
    remainingTasks: Task[],
    prompts: AgentPrompts
): Promise<{ tasks: any[], usage: number, prompt: string }> => {
    const modelId = "gemini-3-flash-preview";

    // Strict Scope Control
    // We limit new additions strictly to prevent runaway scope expansion.
    const maxNewTasks = 5; 

    const systemInstruction = prompts[AgentRole.SUPERVISOR];
    const fullPrompt = `${systemInstruction}
    
    Original Objective: "${userQuery}"

    Progress so far (Completed Tasks):
    ${completedTasks.map(t => `- [${t.assignedAgent}] ${t.title}: ${t.result ? t.result.substring(0, 300) + "..." : "Done"}`).join('\n')}

    Current Remaining Plan:
    ${remainingTasks.map(t => `- ${t.title} (${t.assignedAgent})`).join('\n')}

    Your Task:
    Evaluate the progress. 
    1. If findings require new tasks, add them to the remaining list.
    2. If the current plan is valid, return it as is.
    3. You can reorder tasks.

    CRITICAL SCOPE CONSTRAINTS:
    - You are strictly limited to adding a MAXIMUM of ${maxNewTasks} new tasks.
    - Do NOT expand the scope unless absolutely critical for the objective.
    - Prefer completing the current plan over adding 'nice-to-have' steps.

    Return a JSON array of the *remaining* tasks (do not include completed ones).`;

    try {
        const response = await generateContentWithFallback({
            model: modelId,
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 2048 },
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            description: { type: Type.STRING },
                            assignedAgent: { type: Type.STRING },
                        },
                        required: ["title", "description", "assignedAgent"],
                    }
                }
            }
        }, AgentRole.SUPERVISOR);

        const jsonText = response.text || "[]";
        const tasksRaw = JSON.parse(jsonText);
        const usage = response.usageMetadata?.totalTokenCount || 0;

        return { tasks: tasksRaw, usage, prompt: fullPrompt };

    } catch (error) {
        console.error("Replanning failed:", error);
        // Fallback to existing if AI fails
        return { tasks: remainingTasks, usage: 0, prompt: fullPrompt };
    }
};

// 3. Execute a specific task based on Agent Role
export const executeAgentTask = async (
    agent: AgentRole, 
    task: Task, 
    context: string,
    prompts: AgentPrompts
): Promise<{ text: string; sources?: string[]; usage: number; prompt: string }> => {
    
    let model = "gemini-3-flash-preview";
    let tools = [];
    
    // Model Selection
    if (agent === AgentRole.RESEARCHER) {
        model = "gemini-3-flash-preview"; 
        tools = [{ googleSearch: {} }];
    } else if (agent === AgentRole.CODER) {
        model = "gemini-3-flash-preview";
    }

    const systemInstruction = prompts[agent];
    const fullPrompt = `${systemInstruction}
    
    Your Task: ${task.title}
    Details: ${task.description}

    Context (Results from previous steps):
    ${context ? context : "No previous context. You are starting the workflow."}
    `;

    try {
        const response = await generateContentWithFallback({
            model,
            contents: fullPrompt,
            config: {
                tools: tools.length > 0 ? tools : undefined,
            }
        }, agent);

        let outputText = response.text || "Task completed, but no text output generated.";
        let sources: string[] = [];
        const usage = response.usageMetadata?.totalTokenCount || 0;

        if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
                if (chunk.web?.uri) {
                    sources.push(chunk.web.uri);
                }
            });
        }

        return { text: outputText, sources, usage, prompt: fullPrompt };

    } catch (error) {
        console.error(`Task execution failed for ${agent}:`, error);
        throw error;
    }
};

// 4. Supervisor: Final Synthesis
export const superviseFinalOutput = async (context: string, prompts: AgentPrompts): Promise<{ text: string; usage: number; prompt: string }> => {
     
     const systemInstruction = prompts[AgentRole.SUPERVISOR];
     const fullPrompt = `${systemInstruction}
     
     The team has finished all tasks.
     Here is the accumulated work logs:
     ${context}

     Please compile this into a final, polished output for the user. 
     Format it nicely with Markdown.`;

     try {
         const response = await generateContentWithFallback({
            model: "gemini-3-flash-preview",
            contents: fullPrompt,
         }, AgentRole.SUPERVISOR);
         
         const usage = response.usageMetadata?.totalTokenCount || 0;
         return { text: response.text || "Final output generation failed.", usage, prompt: fullPrompt };
     } catch (error) {
         return { text: "Error generating final output: " + error, usage: 0, prompt: fullPrompt };
     }
}