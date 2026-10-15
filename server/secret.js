const crypto = require("crypto");

if (!process.env.JWT_SECRET) {
  console.warn("! JWT_SECRET is not set. Using a temporary one, so everyone is signed out on every restart.");
}
module.exports = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
