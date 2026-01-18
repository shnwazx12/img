import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import FormData from "form-data";
import http from "http";

const BOT_TOKEN = process.env.BOT_TOKEN;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const OWNER_ID = Number(process.env.OWNER_ID || 0);
const OWNER_USERNAME = process.env.OWNER_USERNAME || "@MrZyroDev";
const AUTO_DELETE_MINUTES = Number(process.env.AUTO_DELETE_MINUTES || 0);

// Render Port Binding
const port = process.env.PORT || 4000;

if (!BOT_TOKEN) {
  console.log("BOT_TOKEN missing in env");
  process.exit(1);
}
if (!IMGBB_API_KEY) {
  console.log("IMGBB_API_KEY missing in env");
  process.exit(1);
}

// Tiny HTTP server for Render
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Image to Link Maker Bot is running");
  })
  .listen(port, () => console.log(`Web server running on port ${port}`));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Stylish bold buttons (no emojis)
const mainButtons = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "𝗨𝗣𝗟𝗢𝗔𝗗 • 𝗜𝗠𝗔𝗚𝗘", callback_data: "upload_image" }],
      [{ text: "𝗚𝗘𝗡𝗘𝗥𝗔𝗧𝗘 • 𝗟𝗜𝗡𝗞", callback_data: "upload_image" }],
      [
        { text: "𝗛𝗘𝗟𝗣", callback_data: "help" },
        { text: "𝗔𝗕𝗢𝗨𝗧", callback_data: "about" }
      ],
      [{ text: "𝗢𝗪𝗡𝗘𝗥", callback_data: "owner" }]
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

// /start
bot.onText(/\/start/, async (msg) => {
  const text =
    `Welcome ${msg.from.first_name}\n\n` +
    `Send an image and I will generate a direct link.\n\n` +
    `Auto Delete: ${AUTO_DELETE_MINUTES ? `${AUTO_DELETE_MINUTES} min` : "OFF"}\n` +
    `Owner: ${OWNER_USERNAME}\n`;

  const sent = await bot.sendMessage(msg.chat.id, text, mainButtons);
  autoDelete(msg.chat.id, sent.message_id);
});

// /help
bot.onText(/\/help/, async (msg) => {
  const text =
    `Help\n\n` +
    `How to use:\n` +
    `1) Send an image\n` +
    `2) Get direct link\n\n` +
    `Commands:\n` +
    `/start\n` +
    `/help\n` +
    `/about\n\n` +
    `Owner: ${OWNER_USERNAME}\n`;

  const sent = await bot.sendMessage(msg.chat.id, text, mainButtons);
  autoDelete(msg.chat.id, sent.message_id);
});

// /about
bot.onText(/\/about/, async (msg) => {
  const text =
    `About\n\n` +
    `This bot converts images into shareable links.\n` +
    `Fast and Render ready.\n\n` +
    `Owner: ${OWNER_USERNAME}\n`;

  const sent = await bot.sendMessage(msg.chat.id, text, mainButtons);
  autoDelete(msg.chat.id, sent.message_id);
});

// Buttons
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  try {
    if (data === "upload_image") {
      const sent = await bot.sendMessage(chatId, "Send your image now.", mainButtons);
      autoDelete(chatId, sent.message_id);
    }

    if (data === "help") {
      const sent = await bot.sendMessage(chatId, "Send an image to get a link.", mainButtons);
      autoDelete(chatId, sent.message_id);
    }

    if (data === "about") {
      const sent = await bot.sendMessage(chatId, "Image to Link Maker Bot.", mainButtons);
      autoDelete(chatId, sent.message_id);
    }

    if (data === "owner") {
      const sent = await bot.sendMessage(
        chatId,
        `Owner: ${OWNER_USERNAME}\nOwner ID: ${OWNER_ID || "Not Set"}`,
        mainButtons
      );
      autoDelete(chatId, sent.message_id);
    }

    await bot.answerCallbackQuery(q.id);
  } catch (err) {
    await bot.answerCallbackQuery(q.id, { text: "Error", show_alert: false });
  }
});

// Photo upload
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  try {
    const wait = await bot.sendMessage(chatId, "Uploading...");
    autoDelete(chatId, wait.message_id);

    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const imageRes = await axios.get(fileUrl, { responseType: "arraybuffer" });

    const link = await uploadToImgbb(imageRes.data);

    if (!link) {
      const fail = await bot.sendMessage(chatId, "Upload failed. Try again.");
      autoDelete(chatId, fail.message_id);
      return;
    }

    const sent = await bot.sendMessage(chatId, `Uploaded\n\nLink:\n${link}`, mainButtons);
    autoDelete(chatId, sent.message_id);
  } catch (err) {
    const sent = await bot.sendMessage(chatId, "Upload failed. Please try again.");
    autoDelete(chatId, sent.message_id);
  }
});

// Broadcast (Owner only)
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    const sent = await bot.sendMessage(chatId, "Only owner can use broadcast.");
    autoDelete(chatId, sent.message_id);
    return;
  }

  const text = match[1];
  const sent = await bot.sendMessage(chatId, `Broadcast Sent\n\n${text}`);
  autoDelete(chatId, sent.message_id);
});

console.log("Bot running...");
