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
}

new Proxy();
