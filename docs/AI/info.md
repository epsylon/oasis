# Oasis AI General Info

The Collective Artificial Intelligence (CAI) of Oasis is called **"42"**.

## Model

`src/AI/oasis-42-1-chat.Q4_K_M.gguf` is **Qwen2.5-3B-Instruct** quantised to Q4_K_M (2,1 GB, 4-bit), released under the Apache-2.0 licence:

It speaks 29 languages, has a 32k-token context window and runs on CPU on any machine with 4 GB of free RAM. Oasis uses a context of 2k to 8k tokens depending on the RAM of the machine. No GPU is required or used.

## How 42 answers

1. **Questions about you and your network** (balance and ECO value, UBI, karma, agenda, events, tasks, transfers, who follows you, inbox, government, emergencies, jobs, market, shops, school, projects, housing, industry, campaigns, logistics, calendars, votes, wiki, chats, mailing lists, podcasts, media, blogs, reports, games, tags, favorites, modules, network status) are answered from the **live data of your node**. The model only phrases the facts it is given and never invents them. The facts used are listed under the answer, with links.
2. **Other questions** are answered by the model with the help of the **knowledge of the network**: the exchanges that inhabitants approved for training are embedded and the ones closest to your question (weighted by their rating and helpful votes) are handed to the model as context. If an approved exchange is almost identical to your question, its answer is returned directly.
3. The conversation keeps the last turns as history and answers in your Oasis language.

## Collective training

Every answer can be approved for training (with tags, a rating and an optional corrected answer) or rejected. Approved exchanges are published to the network as `aiExchange` messages and can be voted helpful or not by others. That is the knowledge 42 reads from.

**Settings › AI › Export Fine-Tuning** downloads every approved exchange of the network (except the ones voted unhelpful) as a JSONL file in chat format, ready for an offline fine-tuning run.

## Service

The model runs in a separate process on `127.0.0.1:4001`, started by Oasis with a per-session token and stopped with it. It is never reachable from the LAN.

## What stays on your device

Your conversation (`~/.ssb/oasis/ai/AI-history.json`) and the embedding caches. Only what you explicitly approve for training is published.
