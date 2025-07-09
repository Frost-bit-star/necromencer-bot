/**
 * Necromancer WhatsApp Bot Handler + Main Module
 * Merged and Updated by stackmorgan
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const chalk = require("chalk");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const { exec, spawn, execSync } = require("child_process");
const PhoneNumber = require("awesome-phonenumber");
const FileType = require("file-type");

const {
  default: dreadedConnect,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
  jidDecode,
  proto,
  getContentType,
} = require("@whiskeysockets/baileys");

// === CONFIG ===
const ownerNumber = "254768974189@s.whatsapp.net"; // Replace with your full WhatsApp ID
global.activateai = true; // AI is active by default
const sessionName = "session";

// === AI FUNCTIONS ===
function setAIStatus(status) { global.activateai = status; }
function getAIStatus() { return global.activateai; }

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

// === UTILITY ===
function color(text, colorName) {
  return chalk[colorName] ? chalk[colorName](text) : chalk.green(text);
}

// === SESSION INITIALIZATION ===
async function initializeSession() {
  const { session } = require('./settings');
  const credsPath = path.join(__dirname, 'session', 'creds.json');

  try {
    const decoded = atob(session);
    if (!fs.existsSync(credsPath) || session !== "zokk") {
      console.log("📡 connecting...");
      fs.writeFileSync(credsPath, decoded, "utf8");
    }
  } catch (e) {
    console.log("Session is invalid: " + e);
  }
}
initializeSession();

// === MESSAGE PARSER ===
function smsg(conn, m) {
  if (!m) return m;
  let M = proto.WebMessageInfo;
  if (m.key) {
    m.id = m.key.id;
    m.isBaileys = m.id.startsWith("BAE5") && m.id.length === 16;
    m.chat = m.key.remoteJid;
    m.fromMe = m.key.fromMe;
    m.isGroup = m.chat.endsWith("@g.us");
    m.sender = conn.decodeJid((m.fromMe && conn.user.id) || m.participant || m.key.participant || m.chat || "");
    if (m.isGroup) m.participant = conn.decodeJid(m.key.participant) || "";
  }
  if (m.message) {
    m.mtype = getContentType(m.message);
    m.msg = m.mtype == "viewOnceMessage" ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)] : m.message[m.mtype];
    m.body = m.message.conversation || m.msg.caption || m.msg.text || "";
  }
  m.text = m.msg.text || m.msg.caption || m.message.conversation || "";
  m.reply = (text, chatId = m.chat, options = {}) =>
    Buffer.isBuffer(text) ? conn.sendMedia(chatId, text, "file", "", m, { ...options }) : conn.sendText(chatId, text, m, { ...options });
  return m;
}

// === MAIN BOT FUNCTION ===
async function startHisoka() {
  const { state, saveCreds } = await useMultiFileAuthState(`./${sessionName}`);
  const client = dreadedConnect({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["backtrack", "Safari", "5.1.7"],
    markOnlineOnConnect: true,
    version: [2, 3000, 1023223821],
    auth: state,
  });

  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      mek = chatUpdate.messages[0];
      if (!mek.message) return;
      mek.message = Object.keys(mek.message)[0] === "ephemeralMessage" ? mek.message.ephemeralMessage.message : mek.message;

      if (mek.key.remoteJid.endsWith('@s.whatsapp.net')) {
        const from = mek.key.remoteJid;
        const mtype = getContentType(mek.message);
        const msg = mek.message[mtype];
        const text = msg?.text || msg?.conversation || msg?.caption || "";

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

        // AI REPLY
        if (getAIStatus() && !mek.key.fromMe) {
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
      startHisoka();
    } else if (connection === "open") {
      console.log(color("✅ Connected successfully!", "green"));
    }
  });

  client.ev.on("creds.update", saveCreds);
}

startHisoka();

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