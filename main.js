/**
 * Necromancer WhatsApp Bot Handler Module
 * Updated by stackmorgan
 */

const {
  getContentType
} = require("@whiskeysockets/baileys");

const axios = require("axios").default;
const chalk = require("chalk");
const { Boom } = require("@hapi/boom");

// === CONFIG ===
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

// === EXPORT HANDLER FUNCTION ===
module.exports = async (client, m, chatUpdate) => {
  try {
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
        await client.sendMessage(from, { text: "✅ AI has been activated and is now replying to messages automatically." });
      } else if (command === ".deactivateai") {
        setAIStatus(false);
        await client.sendMessage(from, { text: "💀 The Necromancer AI returns to shadows." });
        await client.sendMessage(from, { text: "❌ AI has been deactivated and will stop replying automatically." });
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
    console.error("main.js handler error:", err);
  }
};