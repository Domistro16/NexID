import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_HEX = process.env.NOTES_ENCRYPTION_KEY ?? "";

function getKey(): Buffer {
    if (!KEY_HEX || KEY_HEX.length !== 64) {
        throw new Error(
            "NOTES_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). " +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        );
    }
    return Buffer.from(KEY_HEX, "hex");
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns { encrypted, iv } where both are base64-encoded strings.
 */
export function encrypt(plaintext: string): { encrypted: string; iv: string } {
    const key = getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    // Append the auth tag to the ciphertext
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([Buffer.from(encrypted, "base64"), authTag]);

    return {
        encrypted: combined.toString("base64"),
        iv: iv.toString("base64"),
    };
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 * Expects the encrypted string to contain ciphertext + 16-byte auth tag (base64),
 * and iv as a base64-encoded string.
 */
export function decrypt(encryptedBase64: string, ivBase64: string): string {
    const key = getKey();
    const iv = Buffer.from(ivBase64, "base64");
    const combined = Buffer.from(encryptedBase64, "base64");

    // Last 16 bytes are the auth tag
    const authTag = combined.subarray(combined.length - 16);
    const ciphertext = combined.subarray(0, combined.length - 16);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
}
