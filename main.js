/**
 * Necromancer WhatsApp Bot
 * Updated by ChatGPT 2025-07-07
 */

const {
  BufferJSON,
  STORIES_JID,
  WA_DEFAULT_EPHEMERAL,
  generateWAMessageFromContent,
  proto,
  generateWAMessageContent,
  generateWAMessage,
  prepareWAMessageMedia,
  areJidsSameUser,
  getContentType
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const util = require("util");
const cheerio = require("cheerio");
const axios = require("axios").default;
const fetch = require("node-fetch");
const chalk = require("chalk");
const { exec, spawn, execSync } = require("child_process");
const express = require("express");
const app = express();
const pino = require("pino");
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");

// === CONFIG ===
const PORT = process.env.PORT || 3000;
const ownerNumber = "254768974189@s.whatsapp.net"; // Replace with your full WhatsApp ID

// === DUMMY AI STATUS STORAGE ===
let AI_ACTIVE = false;
function setAIStatus(status) {
  AI_ACTIVE = status;
}
function getAIStatus() {
  return AI_ACTIVE;
}

// === COLOR UTILITY ===
function color(text, colorName) {
  return chalk[colorName] ? chalk[colorName](text) : chalk.green(text);
}

// === AI REPLY FUNCTION ===
async function aiReply(messages) {
  try {
    const systemPrompt = "You are replying as me in WhatsApp chats. Reply casually, naturally, and personally as a young, confident, funny guy. Always reply in first person as if you are me. Never mention AI, assistant, or anything robotic. Make replies feel real and authentic, with slang, jokes, emojis, and smooth compliments where relevant. Keep it short, natural, and fitting the flow of conversation. Do not sound like a chatbot or motivational speaker. Do not say 'I'm here for you' or 'let me know what's up'. Always read previous messages carefully and reply naturally to the latest one as if you are continuing the conversation seamlessly.";

    const combinedText = systemPrompt + "\n\n" + messages.map(m => {
      return `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`;
    }).join('\n');

    const response = await axios.get("https://api.dreaded.site/api/chatgpt", {
      params: { text: combinedText }
    });

    if (response.data?.result?.prompt) {
      return response.data.result.prompt;
    } else {
      return "❌ Invalid response from AI API";
    }
  } catch (err) {
    console.log("AI API error:", err.response?.data || err.message);
    return "😂 Sorry, brain jammed for a sec. Try again!";
  }
}

// === MAIN BOT FUNCTION ===
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');

  const client = makeWASocket({
    logger: pino({ level: "silent" }),
    browser: ["NecromancerBot", "Chrome", "1.0.0"],
    auth: state,
  });

  client.ev.on("creds.update", saveCreds);

  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

      console.log("Connection closed:", reason);

      if ([DisconnectReason.badSession, DisconnectReason.connectionReplaced, DisconnectReason.loggedOut].includes(reason)) {
        console.log("❌ Invalid session or replaced. Exiting...");
        process.exit();
      } else {
        console.log("🔄 Reconnecting in 5s...");
        setTimeout(() => startBot(), 5000);
      }
    }

    if (connection === "open") {
      console.log(color("💀 Necromancer WhatsApp bot resurrected!", "magenta"));
      try {
        await client.sendMessage(ownerNumber, {
          text: "☠️ The Necromancer has risen. Awaiting your dark commands."
        });
      } catch (err) {
        console.log("❌ Failed to notify owner:", err.message);
      }
    }
  });

  // === MESSAGES HANDLER ===
  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      const m = chatUpdate.messages[0];
      if (!m.message) return;

      const mtype = getContentType(m.message);
      const msg = m.message[mtype];
      const text = msg?.text || msg?.conversation || msg?.caption || "";
      const from = m.key.remoteJid;

      console.log("From:", from, "Text:", text);

      // OWNER COMMANDS
      if (from === ownerNumber && text.startsWith(".")) {
        const command = text.trim().toLowerCase();
        if (command === ".activateai") {
          setAIStatus(true);
          await client.sendMessage(from, { text: "🔮 The Necromancer AI is awake." });
        } else if (command === ".deactivateai") {
          setAIStatus(false);
          await client.sendMessage(from, { text: "💀 The Necromancer AI returns to shadows." });
        }
        return;
      }

      // AI REPLIES
      if (getAIStatus() && !m.key.fromMe && from.endsWith("@s.whatsapp.net")) {
        await client.sendPresenceUpdate('composing', from);

        // Fetch last 5 messages for context
        const history = await client.fetchMessagesFromJid(from, 5);
        const messages = history
          .filter(h => h.message)
          .map(h => ({
            role: h.key.fromMe ? "assistant" : "user",
            content: h.message?.conversation || h.message?.extendedTextMessage?.text || ""
          }));
        messages.push({ role: "user", content: text });

        const aiText = await aiReply(messages);
        await client.sendMessage(from, { text: aiText });

        await client.sendPresenceUpdate('paused', from);
      }

    } catch (err) {
      console.error("messages.upsert error:", err);
    }
  });
}

// === EXPRESS ENDPOINT ===
app.get("/", (req, res) => {
  res.send("💀 Necromancer WhatsApp bot is running and awaiting commands!");
});

app.listen(PORT, () => {
  console.log(`🚀 Express server running on port ${PORT}`);
});

// === GLOBAL ERROR HANDLERS ===
process.on('unhandledRejection', (reason, p) => {
  console.log('🔥 Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', err => {
  console.log('🔥 Uncaught Exception thrown:', err);
});

// === START BOT ===
startBot();