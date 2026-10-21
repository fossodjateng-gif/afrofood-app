import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashStaffPassword(password: string) {
  if (password.length < 12 || password.length > 256) throw new Error("Password must contain 12 to 256 characters");
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyStaffPassword(password: string, encoded: string) {
  if (!password || password.length > 256) return false;
  const [version, salt, digest] = encoded.split(":");
  if (version !== "scrypt-v1" || !/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(digest || "")) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(digest, "hex"));
}
