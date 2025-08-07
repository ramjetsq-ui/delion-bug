const fs = require("fs");
const crypto = require("crypto");

const FILE_PATH = "./users.json";
const SECRET_KEY = crypto.createHash("sha256").update("XERX_SECRET").digest(); // 32-byte key

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(encryptedText) {
  const [ivHex, dataHex] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", SECRET_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function getUsers() {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const jsonString = decrypt(raw);
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("❌ Gagal dekripsi users.json:", e);
    return [];
  }
}

function saveUsers(users) {
  try {
    const jsonString = JSON.stringify(users, null, 2);
    const encrypted = encrypt(jsonString);
    fs.writeFileSync(FILE_PATH, encrypted, "utf8");
    console.log("✅ user berhasil disimpan.");
  } catch (e) {
    console.error("❌ Gagal enkripsi users.json:", e);
  }
}

module.exports = { getUsers, saveUsers };