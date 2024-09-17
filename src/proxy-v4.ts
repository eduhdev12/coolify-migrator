import consola from "consola";
import * as dotenv from "dotenv";
import fs from "fs";
import { Client as SSHClient } from "ssh2";
import FileTransfer from "./FileTransfer";
import { sleep } from "./utils";

dotenv.config();

class Proxy {
  private fileTransfer: FileTransfer;
  private ssh: SSHClient;

  constructor() {
    this.fileTransfer = new FileTransfer();

    global.transfer = this.fileTransfer;

    const v3 = new SSHClient()
      .connect({
        host: process.env.V3_HOST!,
        port: Number(process.env.V3_PORT),
        username: process.env.V3_USER!,
        password: process.env.V3_PASSWORD!,
        privateKey: !!process.env.V3_PRIVATE_KEY
          ? fs.readFileSync(process.env.V3_PRIVATE_KEY)
          : undefined,
      })
      .on("ready", async () => {
        const v3Key = await this.getV3Decrypt(v3);
        if (!v3Key) {
          return consola.error("Failed to get v3 decrypt key");
        }

        consola.info("V3_SECRET_KEY", v3Key);
      })
      .on("error", (error) => {
        consola.error("Error connecting v4", error);
      });

    this.ssh = new SSHClient()
      .connect({
        host: process.env.V4_HOST!,
        port: Number(process.env.V4_PORT),
        username: process.env.V4_USER!,
        password: process.env.V4_PASSWORD,
        privateKey: fs.readFileSync(process.env.V4_PRIVATE_KEY!),
      })
      .on("ready", () => {
        consola.success("Connected to v4 SSH");

        this.init();
      })
      .on("error", (error) => {
        consola.error("Error connecting v4", error);
      });
  }

  private async checkExists() {
    const proxy = await global.transfer.folderExistsOnV4("/root/v4-proxy/");

    if (!!proxy) {
      consola.warn("Proxy is already installed and exists");
      process.exit(0);
    }
  }

  private async init() {
    await sleep(4500);
    await this.getV4Info();

    await this.checkExists();

    const containerId = await this.getDatabaseContainerId();
    if (!containerId) {
      return consola.error("Couldn't find v4 database container id");
    }

    await this.setup(containerId);

    await this.install();

    await this.start();
  }

  private async setup(id: string) {
    const dockerComposeContent = await fs.promises.readFile(
      `${__dirname}/../v4-proxy/docker-compose.yml`,
      "utf8"
    );

    const updatedDockerComposeContent = dockerComposeContent.replace(
      /container_id/g,
      id
    );

    await fs.promises.writeFile(
      `${__dirname}/../v4-proxy/docker-compose.yml`,
      updatedDockerComposeContent
    );

    const nginxConfContent = await fs.promises.readFile(
      `${__dirname}/../v4-proxy/nginx.conf`,
      "utf8"
    );

    const updatedNginxConfContent = nginxConfContent.replace(
      /container_id/g,
      id
    );
    await fs.promises.writeFile(
      `${__dirname}/../v4-proxy/nginx.conf`,
      updatedNginxConfContent
    );

    consola.success(
      `Updated docker-compose.yml and nginx.conf with container ID: ${id}`
    );
  }

  private async install() {
    return new Promise<string | null>(async (resolve, reject) => {
      await this.fileTransfer.uploadDirectory(
        `${__dirname}/../v4-proxy`,
        "/root/v4-proxy",
        true,
        async () => {
          consola.success("Transfered proxy files to v4 server");
          resolve(null);
        }
      );
    });
  }

  private async start() {
    return new Promise<string | null>((resolve, reject) => {
      this.ssh.exec(
        "cd /root/v4-migrate && docker compose up --build -d",
        (err, stream) => {
          if (err) {
            consola.error("Error executing SSH command", err);
            return;
          }

          let output = "";

          stream
            .on("data", async (data: string) => {
              output += data;
            })
            .on("close", (code: number, signal: string) => {
              if (code === 0) {
                resolve(null);
              } else {
                consola.error(
                  "Dump process exited with code",
                  code,
                  "and signal",
                  signal
                );
                reject(code);
              }
            })
            .stderr.on("data", (data) => {
              consola.error("STDERR: " + data);
            });
        }
      );
    });
  }

  private async getDatabaseContainerId() {
    return new Promise<string | null>((resolve, reject) => {
      this.ssh.exec(
        'docker ps --filter "name=coolify-db" --format "{{.ID}}"',
        (err, stream) => {
          if (err) {
            consola.error("Error executing SSH command", err);
            return;
          }

          let output = "";

          stream
            .on("data", async (data: string) => {
              output += data;
            })
            .on("close", (code: number, signal: string) => {
              if (code === 0) {
                resolve(output.trim());
              } else {
                consola.error(
                  "Dump process exited with code",
                  code,
                  "and signal",
                  signal
                );
                reject(code);
              }
            })
            .stderr.on("data", (data) => {
              consola.error("STDERR: " + data);
            });
        }
      );
    });
  }

  private async getV4Info() {
    const key = await this.getV4AppKey();
    if (!key) {
      return consola.error("Failed to get the application v4 key");
    }
    const db = await this.getDBPassowrd();

    consola.info("V4_SECRET_KEY", key);
    consola.info(
      "V4_DATABASE",
      `postgresql://coolify:${db}@localhost:1338/coolify`
    );
  }

  private async getV4AppKey() {
    return new Promise<string | null>((resolve, reject) => {
      this.ssh.exec("docker exec coolify printenv APP_KEY", (err, stream) => {
        if (err) {
          consola.error("Error executing SSH command", err);
          return;
        }

        let output = "";

        stream
          .on("data", async (data: string) => {
            output += data;
          })
          .on("close", (code: number, signal: string) => {
            if (code === 0) {
              resolve(output.trim());
            } else {
              consola.error(
                "Dump process exited with code",
                code,
                "and signal",
                signal
              );
              reject(code);
            }
          })
          .stderr.on("data", (data) => {
            consola.error("STDERR: " + data);
          });
      });
    });
  }

  private async getDBPassowrd() {
    return new Promise<string | null>((resolve, reject) => {
      this.ssh.exec(
        "docker exec coolify printenv DB_PASSWORD",
        (err, stream) => {
          if (err) {
            consola.error("Error executing SSH command", err);
            return;
          }

          let output = "";

          stream
            .on("data", async (data: string) => {
              output += data;
            })
            .on("close", (code: number, signal: string) => {
              if (code === 0) {
                resolve(output.trim());
              } else {
                consola.error(
                  "Dump process exited with code",
                  code,
                  "and signal",
                  signal
                );
                reject(code);
              }
            })
            .stderr.on("data", (data) => {
              consola.error("STDERR: " + data);
            });
        }
      );
    });
  }

  private async getV3Decrypt(client: SSHClient) {
    return new Promise<string | null>((resolve, reject) => {
      client.exec(
        "docker exec coolify printenv COOLIFY_SECRET_KEY",
        (err, stream) => {
          if (err) {
            consola.error("Error executing SSH command", err);
            return;
          }

          let output = "";

          stream
            .on("data", async (data: string) => {
              output += data;
            })
            .on("close", (code: number, signal: string) => {
              if (code === 0) {
                resolve(output.trim());
              } else {
                consola.error(
                  "Dump process exited with code",
                  code,
                  "and signal",
                  signal
                );
                reject(code);
              }
            })
            .stderr.on("data", (data) => {
              consola.error("STDERR: " + data);
            });
        }
      );
    });
  }
}

new Proxy();
