import path from 'path';
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

async function initModel() {
  if (!model) {
    llamaInstance = await getLlama({ gpu: false });
    model = await llamaInstance.loadModel({
      modelPath: path.join(__dirname, '..', 'AI', 'oasis-42-1-chat.Q4_K_M.gguf')
    });
    context = await model.createContext();
    session = new LlamaChatSession({ contextSequence: context.getSequence() });
  }
}

app.post('/ai', async (req, res) => {
  try {
    const userInput = req.body.input;
    await initModel();
    let userContext = '';
    try {
      userContext = await buildAIContext();
    } catch {
      userContext = '';
    }
    const config = getConfig?.() || {};
    const userPrompt = config.ai?.prompt?.trim() || "Provide an informative and precise response.";
    const promptParts = [
      "Context: You are an AI assistant called \"42\" in Oasis, a distributed, encrypted and federated social network.",
    ];
    if (userContext?.trim()) {
      promptParts.push(`User Data:\n${userContext}`);
    }
    promptParts.push(`Query: "${userInput}"`);
    promptParts.push(userPrompt);
    const finalPrompt = promptParts.join('\n\n');
    const response = await session.prompt(finalPrompt);
    res.json({ answer: response.trim() });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.listen(4001);
