import path from 'path';
import { fileURLToPath } from 'url';
import express from '../server/node_modules/express/index.js'; 
import cors from '../server/node_modules/cors/lib/index.js';   
import { getLlama, LlamaChatSession } from '../server/node_modules/node-llama-cpp/dist/index.js';

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
    const userInput = req.body.input;

    await initModel();  
    const prompt = `
      Context: You are an AI assistant in Oasis, a distributed, encrypted and federated social network created by old-school hackers.

      Query: "${userInput}"

      Provide an informative and precise response.
    `;

    const response = await session.prompt(prompt);
    if (!response) {
      res.status(500).json({ error: 'Failed to get response from model' });
      return;
    }
    res.json({ answer: response.trim() });
});

app.listen(4001, () => {
});
