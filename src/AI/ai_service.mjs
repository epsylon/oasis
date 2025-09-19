import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from '../server/node_modules/express/index.js';
import cors from '../server/node_modules/cors/lib/index.js';
import { getLlama, LlamaChatSession } from '../server/node_modules/node-llama-cpp/dist/index.js';

let getConfig, buildAIContext;
try {
  getConfig = (await import('../configs/config-manager.js')).getConfig;
} catch {}

try {
  const mod = await import('./buildAIContext.js');
  buildAIContext = mod.default || mod.buildContext;
} catch {}

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let llamaInstance, model, context, session;
let ready = false;
let lastError = null;

async function initModel() {
  if (model) return;
  const modelPath = path.join(__dirname, 'oasis-42-1-chat.Q4_K_M.gguf');
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found at: ${modelPath}`);
  }
  llamaInstance = await getLlama({ gpu: false });
  model = await llamaInstance.loadModel({ modelPath });
  context = await model.createContext();
  session = new LlamaChatSession({ contextSequence: context.getSequence() });
  ready = true;
}

app.post('/ai', async (req, res) => {
  try {
    const userInput = String(req.body.input || '').trim();
    await initModel();

    let userContext = '';
    let snippets = [];
    try {
      userContext = await (buildAIContext ? buildAIContext(120) : '');
      if (userContext) {
        snippets = userContext.split('\n').slice(0, 50);
      }
    } catch {}

    const config = getConfig?.() || {};
    const baseContext = 'Context: You are an AI assistant called "42" in Oasis, a distributed, encrypted and federated social network.';
    const userPrompt = [baseContext, config.ai?.prompt?.trim() || 'Provide an informative and precise response.'].join('\n');

    const prompt = [
      userContext ? `User Data:\n${userContext}` : '',
      `Query: "${userInput}"`,
      userPrompt
    ].filter(Boolean).join('\n\n');
    const answer = await session.prompt(prompt);
    res.json({ answer: String(answer || '').trim(), snippets });
  } catch {}
});

app.post('/ai/train', async (req, res) => {
  res.json({ stored: true });
});

app.listen(4001);
