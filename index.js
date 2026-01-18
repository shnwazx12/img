import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import FormData from "form-data";

const BOT_TOKEN = process.env.BOT_TOKEN;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const OWNER_ID = Number(process.env.OWNER_ID || 0);
const AUTO_DELETE_MINUTES = Number(process.env.AUTO_DELETE_MINUTES || 0);

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN missing in env");
  process.exit(1);
}
if (!IMGBB_API_KEY) {
  console.log("❌ IMGBB_API_KEY missing in env");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const mainButtons = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "📸 Upload Image", callback_data: "upload_image" },
        { text: "ℹ️ About", callback_data: "about" }
      ],
      [
        { text: "🆘 Help", callback_data: "help" },
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

bot.onText(/\/start/, async (msg) => {
  const text =
    `👋 Hey ${msg.from.first_name}!\n\n` +
    `📸 Send me any image and I will generate a direct link 🔗\n\n` +
    `⚡ Auto Delete: ${AUTO_DELETE_MINUTES ? `${AUTO_DELETE_MINUTES} min` : "OFF"}\n`;

  const sent = await bot.sendMessage(msg.chat.id, text, mainButtons);
  autoDelete(msg.chat.id, sent.message_id);
});

bot.onText(/\/help/, async (msg) => {
  const text =
    `🆘 *Help Menu*\n\n` +
    `📌 *How to use:*\n` +
    `1) Send me an image\n` +
    `2) I upload it & give you link 🔗\n\n` +
    `✨ Commands:\n` +
    `/start - Start bot\n` +
    `/help - Help menu\n` +
    `/about - About bot\n\n` +
    `⚡ Auto delete links after: ${AUTO_DELETE_MINUTES ? `${AUTO_DELETE_MINUTES} min` : "OFF"}\n`;

  const sent = await bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown", ...mainButtons });
  autoDelete(msg.chat.id, sent.message_id);
});

bot.onText(/\/about/, async (msg) => {
  const text =
    `ℹ️ *About*\n\n` +
    `This bot converts images into shareable links 🔗\n` +
    `Fast • Clean • Render Ready 🚀\n\n` +
    `👑 Owner ID: ${OWNER_ID || "Not Set"}\n`;

  const sent = await bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown", ...mainButtons });
  autoDelete(msg.chat.id, sent.message_id);
});

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  try {
    if (data === "upload_image") {
      const sent = await bot.sendMessage(chatId, "📸 Send your image now 🙂");
      autoDelete(chatId, sent.message_id);
    }

    if (data === "help") {
      const sent = await bot.sendMessage(
        chatId,
        `🆘 *Help*\n\nSend an image → get a link 🔗`,
        { parse_mode: "Markdown", ...mainButtons }
      );
      autoDelete(chatId, sent.message_id);
    }

    if (data === "about") {
      const sent = await bot.sendMessage(
        chatId,
        `ℹ️ *About*\n\nMade for Image → Link conversion 🔥`,
        { parse_mode: "Markdown", ...mainButtons }
      );
      autoDelete(chatId, sent.message_id);
    }

    if (data === "owner") {
      const sent = await bot.sendMessage(
        chatId,
        `👑 Owner System\n\n${isOwner(q.from.id) ? "✅ You are Owner" : "❌ You are not Owner"}`,
        mainButtons
      );
      autoDelete(chatId, sent.message_id);
    }

    await bot.answerCallbackQuery(q.id);
  } catch (err) {
    await bot.answerCallbackQuery(q.id, { text: "❌ Error", show_alert: false });
  }
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  try {
    const wait = await bot.sendMessage(chatId, "⏳ Uploading your image...");
    autoDelete(chatId, wait.message_id);

    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const imageRes = await axios.get(fileUrl, { responseType: "arraybuffer" });

    const link = await uploadToImgbb(imageRes.data);

    if (!link) {
      const fail = await bot.sendMessage(chatId, "❌ Upload failed. Try again.");
      autoDelete(chatId, fail.message_id);
      return;
    }

    const sent = await bot.sendMessage(
      chatId,
      `✅ *Image Uploaded!*\n\n🔗 Link:\n${link}`,
      { parse_mode: "Markdown", ...mainButtons }
    );

    autoDelete(chatId, sent.message_id);
  } catch (err) {
    const sent = await bot.sendMessage(chatId, "❌ Upload failed! Please try again.");
    autoDelete(chatId, sent.message_id);
  }
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    const sent = await bot.sendMessage(chatId, "❌ Only owner can use broadcast.");
    autoDelete(chatId, sent.message_id);
    return;
  }

  const text = match[1];

  const sent = await bot.sendMessage(chatId, `✅ Broadcast Sent:\n\n${text}`);
  autoDelete(chatId, sent.message_id);
});

bot.on("message", async (msg) => {
  if (!msg.photo && msg.text && !msg.text.startsWith("/")) {
    const sent = await bot.sendMessage(msg.chat.id, "📸 Send an image only 🙂", mainButtons);
    autoDelete(msg.chat.id, sent.message_id);
  }
});

console.log("✅ Bot running...");
