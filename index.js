/**
 * Necromancer WhatsApp Bot Handler + Main Module
 * Updated by StackMorgan for your production deployment
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const chalk = require("chalk");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const PhoneNumber = require("awesome-phonenumber");
const { default: dreadedConnect, useMultiFileAuthState, DisconnectReason, getContentType } = require("@whiskeysockets/baileys");

// === CONFIG ===
const sessionName = "session";
global.activateai = true; // AI is always active by default

// === AI REPLY FUNCTION ===
async function aiReply(messages) {
  try {
    const systemPrompt = "You are replying as me in WhatsApp chats. Reply casually, naturally, and personally as a young, confident, funny guy. Always reply in first person as if you are me. Never mention AI, assistant, or anything robotic. Make replies feel real and authentic, with slang, jokes, emojis, and smooth compliments where relevant. Keep it short, natural, and fitting the flow of conversation. Do not sound like a chatbot or motivational speaker. Do not say 'I'm here for you' or 'let me know what's up'. Always read previous messages carefully and reply naturally to the latest one as if you are continuing the conversation seamlessly.";

    const combinedText = systemPrompt + "\n\n" + messages.map(m => {
      return `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`;
    }).join('\n');

    const response = await fetch("https://api.dreaded.site/api/chatgpt?text=" + encodeURIComponent(combinedText));
    const data = await response.json();

    if (data?.result?.prompt) {
      return data.result.prompt;
    } else {
      return "😂 Sorry, brain jammed for a sec. Try again!";
    }
  } catch (err) {
    console.log("AI API error:", err);
    return "😂 Sorry, brain jammed for a sec. Try again!";
  }
}

// === UTILITY ===
function color(text, colorName) {
  return chalk[colorName] ? chalk[colorName](text) : chalk.green(text);
}

// === SESSION INITIALIZATION ===
async function initializeSession() {
  const { session } = require('./settings');
  const credsPath = path.join(__dirname, 'session', 'creds.json');

  try {
    if (!session || session === "zokk") {
      console.log("❌ No valid session data found. Please pair manually.");
      return;
    }

    const decoded = Buffer.from(session, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);

    if (!fs.existsSync(credsPath)) {
      fs.mkdirSync(path.dirname(credsPath), { recursive: true });
      fs.writeFileSync(credsPath, JSON.stringify(parsed, null, 2), "utf8");
      console.log("✅ Session initialized from settings.js");
    } else {
      console.log("✅ Session file exists. Skipping initialization.");
    }

  } catch (e) {
    console.log("❌ Failed to initialize session:", e.message);
  }
}
initializeSession();

// === MAIN BOT FUNCTION ===
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(`./${sessionName}`);
  const client = dreadedConnect({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["backtrack", "Safari", "5.1.7"],
    markOnlineOnConnect: true,
    auth: state,
  });

  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      const mek = chatUpdate.messages[0];
      if (!mek.message) return;

      const from = mek.key.remoteJid;
      const mtype = getContentType(mek.message);
      const msg = mek.message[mtype];
      const text = msg?.text || msg?.conversation || msg?.caption || "";

      console.log("From:", from, "Text:", text);

      if (global.activateai && !mek.key.fromMe) {
        await client.sendPresenceUpdate('composing', from);
        const history = await client.fetchMessagesFromJid(from, 5);
        const messages = history.filter(h => h.message).map(h => ({
          role: h.key.fromMe ? "assistant" : "user",
          content: h.message?.conversation || h.message?.extendedTextMessage?.text || ""
        }));
        messages.push({ role: "user", content: text });

        const aiText = await aiReply(messages);
        await client.sendMessage(from, { text: aiText });
        await client.sendPresenceUpdate('paused', from);
      }
    } catch (err) {
      console.log(err);
    }
  });

  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      console.log(`Connection closed: ${reason}`);
      // No QR fallback, exit process to redeploy cleanly
      process.exit(1);
    } else if (connection === "open") {
      console.log(color("✅ Connected successfully!", "green"));
    }
  });

  client.ev.on("creds.update", saveCreds);
}

startBot();

// === EXPRESS SERVER FOR KEEP ALIVE ===
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Necromancer WhatsApp Bot is running!");
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});