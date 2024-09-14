import consola from "consola";
import { VPSConnect } from "./types/VPS.types";
// @ts-ignore: No typescript support
import fsSync from "fs";
import fs from "fs/promises";
import PQueue from "p-queue";
import path from "path";
import Client from "ssh2-sftp-client";

class FileTransfer {
  private v3Server: VPSConnect | null = null;
  private v4Server: VPSConnect | null = null;
  private v3Client: Client = new Client();
  private v4Client: Client = new Client();

  private queue: PQueue = new PQueue({ concurrency: 5 });

  constructor() {
    if (
      !process.env.V3_HOST ||
      !process.env.V3_PORT ||
      !process.env.V3_USER ||
      !process.env.V3_PASSWORD
    ) {
      consola.error("Failed to init sftp for v3 instance");
      return;
    }

    this.v3Server = {
      host: process.env.V3_HOST,
      port: Number(process.env.V3_PORT),
      user: process.env.V3_USER,
      password: process.env.V3_PASSWORD,
    };

    this.v3Client
      .connect(this.v3Server!)
      .then(() => {
        consola.success("Connected v3 SFTP");
      })
      .catch((err) => {
        consola.error("Failed to connect to v3 SFTP", err);
      });

    // if(!process.env.V4_HOST || !process.env.V4_PORT || !process.env.V4_USER) {
    //     consola.error("Failed to init sftp for v4 instance");
    //     return
    // }

    this.v4Server = {
      host: process.env.V4_HOST!,
      port: Number(process.env.V4_PORT),
      user: process.env.V4_USER!,
      password: process.env.V4_PASSWORD || "",
      privateKey: fsSync.readFileSync("/Users/eduh/.orbstack/ssh/id_ed25519"),
    };

    this.v4Client
      .connect(this.v4Server!)
      .then(() => {
        consola.success("Connected to v4 SFTP");
      })
      .catch((err) => {
        consola.error("Failed to connect to v4 SFTP", err);
      });
  }

  public async downloadDirectory(
    remoteDir: string,
    localDir: string,
    first: boolean = true,
    onFinish?: () => Promise<void>
  ): Promise<void> {
    try {
      // Ensure local directory exists
      await fs.mkdir(localDir, { recursive: true });

      // Read contents of the remote directory
      const fileList = await this.v3Client.list(remoteDir);

      for (const file of fileList) {
        const remotePath = path.join(remoteDir, file.name);
        const localPath = path.join(localDir, file.name);

        if (file.type === "d") {
          await this.downloadDirectory(remotePath, localPath, false);
        } else {
          // Download file
          this.queue.add(
            async () => {
              await this.v3Client.get(remotePath, localPath);
              if (global.dev) {
                consola.success(
                  `Downloaded ${localPath} size=${this.queue.size} pending=${this.queue.pending}`
                );
              }
            },
            { priority: 2 }
          );
        }
      }
    } catch (err: any) {
      consola.error(`Failed to download directory:`, err);
    }

    if (first) {
      await this.queue.onIdle();
      consola.success(`Finished downloading data for ${remoteDir}`);
      await onFinish?.();
    }
  }

  public async uploadDirectory(
    localDir: string,
    remoteDir: string,
    first: boolean = true,
    onFinish?: () => Promise<void>
  ): Promise<void> {
    try {
      // Ensure the remote directory exists
      const remoteExists = await this.v4Client.exists(remoteDir);
      if (!remoteExists) {
        await this.v4Client.mkdir(remoteDir, true); // Create the directory recursively
      }

      // Read contents of the local directory
      const fileList = await fs.readdir(localDir);

      for (const file of fileList) {
        const localPath = path.join(localDir, file);
        const remotePath = path.join(remoteDir, file);

        const stat = await fs.stat(localPath);

        if (stat.isDirectory()) {
          // Recursively upload the directory
          await this.uploadDirectory(localPath, remotePath);
        } else {
          // Upload the file
          await this.v4Client.put(localPath, remotePath);
          consola.success(`Uploaded file: ${localPath} to ${remotePath}`);
        }
      }
    } catch (err) {
      consola.error("Failed to upload directory:", err, `${localDir} -> ${remoteDir}`);
    }

    if (first) {
      await this.queue.onIdle();
      consola.success(`Finished upload data for ${localDir} -> ${remoteDir}`);
      await onFinish?.();
    }
  }

  public async uploadFile(
    localFilePath: string,
    remoteFilePath: string,
    onFinish?: () => Promise<void>
  ): Promise<void> {
    try {
      await this.v4Client.put(localFilePath, remoteFilePath);
      consola.success(`Uploaded file: ${localFilePath} to ${remoteFilePath}`);
    } catch (err) {
      consola.error("Failed to upload file:", err, `${localFilePath} -> ${remoteFilePath}`);
    }

    await onFinish?.();
  }
}

export default FileTransfer;
