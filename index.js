import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import FormData from "form-data";
import http from "http";

const BOT_TOKEN = process.env.BOT_TOKEN;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const OWNER_ID = Number(process.env.OWNER_ID || 0);
const OWNER_USERNAME = process.env.OWNER_USERNAME || "@MrZyroDev";
const AUTO_DELETE_MINUTES = Number(process.env.AUTO_DELETE_MINUTES || 0);

// ✅ Render Port Binding (Required for Web Service)
const port = process.env.PORT || 4000;

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN missing in env");
  process.exit(1);
}
if (!IMGBB_API_KEY) {
  console.log("❌ IMGBB_API_KEY missing in env");
  process.exit(1);
}

// Tiny HTTP server so Render detects open port
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("✅ Image to Link Maker Bot is running!");
  })
  .listen(port, () => console.log(`🌐 Web server running on port ${port}`));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ✨ Stylish buttons
const mainButtons = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "✨ Upload Image 📸", callback_data: "upload_image" },
        { text: "🌸 About Bot", callback_data: "about" }
      ],
      [
        { text: "🆘 Help Guide", callback_data: "help" },
        { text: "👑 Owner", callback_data: "owner" }
      ]
    ]
  }
};

function isOwner(userId) {
  return OWNER_ID && Number(userId) === OWNER_ID;
}

function autoDelete(chatId, messageId) {
  if (!AUTO_DELETE_MINUTES || AUTO_DELETE_MINUTES <= 0) return;

  const ms = AUTO_DELETE_MINUTES * 60 * 1000;
  setTimeout(async () => {
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (e) {}
  }, ms);
}

async function uploadToImgbb(imageBuffer) {
  const form = new FormData();
  form.append("image", Buffer.from(imageBuffer), { filename: "image.jpg" });

  const upload = await axios.post(
    `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
    form,
    { headers: form.getHeaders() }
  );

  return upload.data?.data?.url;
}

// ✅ /start
bot.onText(/\/start/, async (msg) => {
  const text =
    `👋 Hey ${msg.from.first_name} 💖\n\n` +
    `📸 Send me any *image* and I will generate a *direct link* 🔗✨\n\n` +
    `⚡ Auto Delete: ${AUTO_DELETE_MINUTES ? `${AUTO_DELETE_MINUTES} min` : "OFF"}\n` +
    `👑 Owner: ${OWNER_USERNAME}\n`;

  const sent = await bot.sendMessage(msg.chat.id, text, {
    parse_mode: "Markdown",
    ...mainButtons
  });

  autoDelete(msg.chat.id, sent.message_id);
});

// ✅ /help
bot.onText(/\/help/, async (msg) => {
  const text =
    `🆘 *Help Guide*\n\n` +
    `📌 *How to use:*\n` +
    `1) Send an image 📸\n` +
    `2) Get direct link 🔗\n\n` +
    `✨ Commands:\n` +
    `/start - Start bot\n` +
    `/help - Help\n` +
    `/about - About\n\n` +
    `👑 Owner: ${OWNER_USERNAME}\n`;

  const sent = await bot.sendMessage(msg.chat.id, text, {
    parse_mode: "Markdown",
    ...mainButtons
  });

  autoDelete(msg.chat.id, sent.message_id);
});

// ✅ /about
bot.onText(/\/about/, async (msg) => {
  const text =
    `🌸 *About This Bot*\n\n` +
    `This bot converts your images into shareable links 🔗✨\n` +
    `Fast • Clean • Render Ready 🚀\n\n` +
    `👑 Owner: ${OWNER_USERNAME}\n`;

  const sent = await bot.sendMessage(msg.chat.id, text, {
    parse_mode: "Markdown",
    ...mainButtons
  });

  autoDelete(msg.chat.id, sent.message_id);
});

// ✅ Inline buttons handler
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  try {
    if (data === "upload_image") {
      const sent = await bot.sendMessage(chatId, "✨ Send your image now 📸💖");
      autoDelete(chatId, sent.message_id);
    }

    if (data === "help") {
      const sent = await bot.sendMessage(
        chatId,
        `🆘 *Help*\n\nSend image 📸 → Get link 🔗`,
        { parse_mode: "Markdown", ...mainButtons }
      );
      autoDelete(chatId, sent.message_id);
    }

    if (data === "about") {
      const sent = await bot.sendMessage(
        chatId,
        `🌸 *About*\n\nImage ➜ Link Maker Bot 🔥`,
        { parse_mode: "Markdown", ...mainButtons }
      );
      autoDelete(chatId, sent.message_id);
    }

    if (data === "owner") {
      const sent = await bot.sendMessage(
        chatId,
        `👑 *Owner Info*\n\nUsername: ${OWNER_USERNAME}\nOwner ID: ${OWNER_ID || "Not Set"}`,
        { parse_mode: "Markdown", ...mainButtons }
      );
      autoDelete(chatId, sent.message_id);
    }

    await bot.answerCallbackQuery(q.id);
  } catch (err) {
    await bot.answerCallbackQuery(q.id, { text: "❌ Error", show_alert: false });
  }
});

// ✅ Photo upload handler
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  try {
    const wait = await bot.sendMessage(chatId, "⏳ Uploading your image... 💫");
    autoDelete(chatId, wait.message_id);

    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const imageRes = await axios.get(fileUrl, { responseType: "arraybuffer" });

    const link = await uploadToImgbb(imageRes.data);

    if (!link) {
      const fail = await bot.sendMessage(chatId, "❌ Upload failed. Try again 😢");
      autoDelete(chatId, fail.message_id);
      return;
    }

    const sent = await bot.sendMessage(
      chatId,
      `✅ *Image Uploaded Successfully!* 🎉\n\n🔗 *Direct Link:*\n${link}\n\n👑 Owner: ${OWNER_USERNAME}`,
      { parse_mode: "Markdown", ...mainButtons }
    );

    autoDelete(chatId, sent.message_id);
  } catch (err) {
    const sent = await bot.sendMessage(chatId, "❌ Upload failed! Please try again 😢");
    autoDelete(chatId, sent.message_id);
  }
});

// ✅ Broadcast (Owner only)
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    const sent = await bot.sendMessage(chatId, "❌ Only owner can use broadcast 👑");
    autoDelete(chatId, sent.message_id);
    return;
  }

  const text = match[1];
  const sent = await bot.sendMessage(chatId, `📢 *Broadcast Sent!*\n\n${text}`, {
    parse_mode: "Markdown"
  });
  autoDelete(chatId, sent.message_id);
});

// ✅ Non-image message reply
bot.on("message", async (msg) => {
  if (!msg.photo && msg.text && !msg.text.startsWith("/")) {
    const sent = await bot.sendMessage(
      msg.chat.id,
      "📸 Please send an image only 🙂✨",
      mainButtons
    );
    autoDelete(msg.chat.id, sent.message_id);
  }
});

console.log("✅ Bot polling started...");
