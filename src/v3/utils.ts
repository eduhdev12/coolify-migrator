import consola from "consola";
import crypto from "crypto";

class V3Utils {
  private algorithm: string = "aes-256-ctr";
  private secretKey: string;

  constructor() {
    this.secretKey = process.env.V3_SECRET_KEY!;
  }

  public decrypt(hashString: string) {
    if (hashString) {
      try {
        const hash = JSON.parse(hashString);
        const decipher = crypto.createDecipheriv(
          this.algorithm,
          this.secretKey,
          Buffer.from(hash.iv, "hex")
        );
        const decrpyted = Buffer.concat([
          decipher.update(Buffer.from(hash.content, "hex")),
          decipher.final(),
        ]);
        return decrpyted.toString();
      } catch (error: any) {
        // consola.log({ decryptionError: error.message, hash: hashString });
        return hashString;
      }
    }
  }

  public encrypt(text: string) {
    if (text) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
      const encrypted = Buffer.concat([
        cipher.update(text.trim()),
        cipher.final(),
      ]);
      return JSON.stringify({
        iv: iv.toString("hex"),
        content: encrypted.toString("hex"),
      });
    }
  }
}

export default V3Utils;
