import { Application, Database, GithubApp, PrismaClient } from "@prisma/client";
import consola from "consola";
import fs from "fs";
import { Client as SSHClient } from "ssh2";
import { sleep } from "../utils";
import V3Utils from "./utils";

class V3 {
  public db: PrismaClient;
  public utils: V3Utils = new V3Utils();
  public ssh: SSHClient;

  constructor() {
    this.ssh = new SSHClient()
      .connect({
        host: process.env.V3_HOST!,
        port: Number(process.env.V3_PORT),
        username: process.env.V3_USER!,
        password: process.env.V3_PASSWORD,
      })
      .on("ready", () => {
        consola.success("Connected to v3 SSH");
      });

    this.db = new PrismaClient();
    consola.success("Connected to Coolify V3 database");

    global.v3 = this;
  }

  // #region: GitHub
  async migrateGitHub() {
    const sources = await global.v3.db.githubApp.findMany();

    await Promise.all(
      sources.map(async (source) => {
        await this.migrateGitHubSource(source);
      })
    );
  }

  public async migrateGitHubSource(github: GithubApp) {
    if (!github.privateKey) {
      return consola.error("Invalid privatekey", github);
    }

    const privateKey = this.utils.decrypt(github.privateKey);
    if (!privateKey) {
      return consola.error("Failed to decrypt privatekey", github);
    }

    const migratedPrivateKey = await global.v4.createPrivateKey(
      github.name!,
      privateKey
    );

    consola.success("Migrated private key for", github.name!);

    const migratedGitHub = await global.v4.createGitHub(
      github.name!,
      github.appId!,
      github.installationId!,
      github.clientId!,
      this.utils.decrypt(github.clientSecret!.toString())!,
      this.utils.decrypt(github.webhookSecret!.toString())!,
      migratedPrivateKey.id
    );

    consola.success("Migrated GitHub source", migratedGitHub.name);

    return migratedGitHub;
  }
  // #endregion

  //#region PostgreSQL

  public async dumpPostgresSQL(database: Database): Promise<string | null> {
    const dbPassword = this.utils.decrypt(database.dbUserPassword!);
    const rootPassword = this.utils.decrypt(database.rootUserPassword!);

    if (!dbPassword || !rootPassword) {
      consola.error("Invalid password for database", database.name);
      return null;
    }

    return new Promise<string | null>((resolve, reject) => {
      this.ssh.exec(
        `docker exec ${database.id} sh -c "PGPASSWORD=${dbPassword} pg_dump --format=custom --no-acl --no-owner --username ${database.dbUser} ${database.defaultDatabase}"`,
        (err, stream) => {
          if (err) {
            consola.error("Error executing SSH command", err);
            reject(err);
            return;
          }

          let dumpData = "";

          stream
            .on("data", async (data: string) => {
              dumpData += data;
              await fs.mkdirSync(`${__dirname}/../../data/${database.id}/`, {
                recursive: true,
              });

              await fs.appendFileSync(
                `${__dirname}/../../data/${database.id}/${database.id}.dmp`,
                data
              );
            })
            .on("close", (code: number, signal: string) => {
              if (code === 0) {
                consola.success(
                  "Saved database dump",
                  database.name,
                  database.id
                );
                resolve(null);
              } else {
                consola.error(
                  "Dump process exited with code",
                  code,
                  "and signal",
                  signal
                );
                reject(new Error(`Dump process failed with code ${code}`));
              }
            })
            .stderr.on("data", (data) => {
              consola.error("STDERR: " + data);
            });
        }
      );
    });
  }

  async migratePostgreSQLDatabases() {
    const databases = await global.v3.db.database.findMany({
      where: { type: "postgresql" },
    });

    await Promise.all(
      databases.map(async (database) => {
        await this.migratePostgreSQL(database);
      })
    );
  }

  public async migratePostgreSQL(database: Database) {
    if (database.type !== "postgresql") return;

    const dumpFilePath = `${__dirname}/../../data/${database.id}/${database.id}.dmp`;

    if (!fs.existsSync(dumpFilePath)) {
      consola.error(
        `Dump file not found for database ${database.name}. We will try to dump the database now.`
      );
      await this.dumpPostgresSQL(database);
    }

    const migratedPostgreSQL = await global.v4.createPostgreSQL(
      database.name,
      database.rootUser!,
      this.utils.decrypt(database.rootUserPassword!)!,
      database.defaultDatabase!,
      database.version,
      database.publicPort
    );
    consola.success(
      "Migrated PostgreSQL",
      migratedPostgreSQL.name,
      migratedPostgreSQL.uuid
    );

    await sleep(4500);

    const migratedVolume = await global.v4.createPostgresSQLVolume(
      migratedPostgreSQL.id,
      migratedPostgreSQL.uuid
    );
    consola.success("Migrated PostgreSQL Volume", migratedVolume.name);

    await global.v4.startDatabase(migratedPostgreSQL.uuid);

    await sleep(10000);

    await global.v4.importPostgreSQL(database, migratedPostgreSQL.uuid);

    return migratedPostgreSQL;
  }
  // #endregion

  //#region MySQL

  public async dumpMySQL(database: Database): Promise<string | null> {
    const dbPassword = this.utils.decrypt(database.dbUserPassword!);
    const rootPassword = this.utils.decrypt(database.rootUserPassword!);

    if (!dbPassword || !rootPassword) {
      consola.error("Invalid password for database", database.name);
      return null;
    }

    return new Promise<string | null>((resolve, reject) => {
      consola.fatal(
        `docker exec ${database.id} sh -c "mysqldump -u ${database.dbUser} -p${dbPassword} ${database.defaultDatabase}"`
      );
      this.ssh.exec(
        `docker exec ${database.id} sh -c "mysqldump -u ${database.dbUser} -p${dbPassword} ${database.defaultDatabase}"`,
        (err, stream) => {
          if (err) {
            consola.error("Error executing SSH command", err);
            reject(err);
            return;
          }

          let dumpData = "";

          stream
            .on("data", async (data: string) => {
              dumpData += data;
              await fs.mkdirSync(`${__dirname}/../../data/${database.id}/`, {
                recursive: true,
              });

              await fs.appendFileSync(
                `${__dirname}/../../data/${database.id}/${database.id}.dmp`,
                data
              );
            })
            .on("close", (code: number, signal: string) => {
              if (code === 0) {
                consola.success(
                  "Saved database dump",
                  database.name,
                  database.id
                );
                resolve(null);
              } else {
                consola.error(
                  "Dump process exited with code",
                  code,
                  "and signal",
                  signal
                );
                reject(new Error(`Dump process failed with code ${code}`));
              }
            })
            .stderr.on("data", (data) => {
              consola.error("STDERR: " + data);
            });
        }
      );
    });
  }

  async migrateMySQLDatabases() {
    const databases = await global.v3.db.database.findMany({
      where: { type: "mysql" },
    });

    await Promise.all(
      databases.map(async (database) => {
        await this.migrateMySQL(database);
      })
    );
  }

  public async migrateMySQL(database: Database) {
    if (database.type !== "mysql") return;

    const dumpFilePath = `${__dirname}/../../data/${database.id}/${database.id}.dmp`;

    if (!fs.existsSync(dumpFilePath)) {
      consola.error(
        `Dump file not found for database ${database.name}. We will try to dump the database now.`
      );
      await this.dumpMySQL(database);
    }

    const migratedMySQL = await global.v4.createMySQL(
      database.name,
      this.utils.decrypt(database.rootUserPassword!)!,
      database.dbUser!,
      this.utils.decrypt(database.dbUserPassword!)!,
      database.defaultDatabase,
      database.publicPort
    );
    consola.success("Migrated MySQL", migratedMySQL.name, migratedMySQL.uuid);

    await sleep(4500);

    const migratedVolume = await global.v4.createMySQLVolume(
      migratedMySQL.id,
      migratedMySQL.uuid
    );
    consola.success("Migrated MySQL Volume", migratedVolume.name);

    await global.v4.startDatabase(migratedMySQL.uuid);

    await sleep(15000);

    await global.v4.importMySQL(database, migratedMySQL.uuid);

    return migratedMySQL;
  }

  // #endregion

  //#region Application

  public async migrateApplication(id: string) {
    const application = await global.v3.db.application.findFirst({
      where: { id: id },
      include: {
        gitSource: { include: { githubApp: true } },
        secrets: true,
        persistentStorage: true,
      },
    });

    if (!application) {
      consola.error("Application not found", id);
      return;
    }

    let gitHubSource = await global.v4.getGitHubApp(
      application.gitSource?.githubApp?.name!
    );

    if (!gitHubSource) {
      if (!application.gitSource || !application.gitSource.githubApp) {
        return consola.error("Github source not found");
      }

      consola.error(
        "Github source not found for application, migrating now..."
      );
      gitHubSource = await this.migrateGitHubSource(
        application.gitSource.githubApp
      );
    }

    let applicationType;

    switch (application.buildPack) {
      case "docker":
        applicationType = "dockerfile";
        break;

      case "compose":
        applicationType = "dockercompose";
        break;

      default:
        applicationType = "nixpacks";
        break;
    }

    const migratedApplication = await global.v4.createApplication(
      !!gitHubSource.id ? application.projectId : null,
      application.name,
      application.fqdn,
      application.repository!,
      application.branch!,
      null,
      null,
      applicationType,
      "nginx:alpine",
      application.installCommand,
      application.buildCommand,
      application.startCommand,
      application.port,
      gitHubSource.id || !!application.repository ? 0 : null,
      null,
      applicationType !== "nixpacks"
        ? application.dockerComposeFileLocation
        : null,
      applicationType !== "nixpacks" ? application.dockerComposeFile : null
    );

    const migratedApplicationSettings =
      await global.v4.createApplicationSettings(migratedApplication.id);

    await Promise.all(
      application.secrets.map(async (secret) => {
        await global.v4.createApplicationSecret(
          migratedApplication.id,
          secret.name,
          secret.value,
          secret.isBuildSecret,
          secret.isPRMRSecret
        );
        consola.success(
          "Migrated application secret",
          `${secret.name} (${
            secret.isPRMRSecret ? "PRMR" : secret.isBuildSecret ? "BUILD" : ""
          })`,
          this.utils.decrypt(secret.value)
        );
      })
    );

    await Promise.all(
      application.persistentStorage
        .filter((ps) => !!ps.hostPath)
        .map(async (persistentStorage) => {
          const sftpHostPath = persistentStorage.hostPath!.replace(
            "~",
            "/root"
          );

          await global.transfer.downloadDirectory(
            //persistentStorage.hostPath!,
            sftpHostPath,
            `${__dirname}/../../data/${application.id}/volume`,
            true,
            async () => {
              await global.transfer.uploadDirectory(
                `${__dirname}/../../data/${application.id}/volume`,
                sftpHostPath,
                true,
                async () => {
                  const migratedApplicationStorage =
                    await global.v4.createApplicationStorage(
                      migratedApplication.id,
                      persistentStorage.path,
                      persistentStorage.hostPath!,
                      true
                    );

                  consola.success(
                    `Migrated application storage - ${application.name} (${
                      migratedApplication.id
                    }) | ${migratedApplicationStorage.fs_path} -> ${
                      migratedApplicationStorage.mount_path
                    } ${
                      migratedApplicationStorage.is_directory
                        ? "(Directory)"
                        : ""
                    }`
                  );
                }
              );
            }
          );
        })
    );
  }
  //#endregion
}

export default V3;
