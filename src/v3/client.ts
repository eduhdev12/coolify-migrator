import { Database, GithubApp, PrismaClient } from "@prisma/client";
import consola from "consola";
import V3Utils from "./utils";
import { Client as SSHClient } from "ssh2";

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
        `docker exec ${database.id} sh -c "PGPASSWORD=${rootPassword} pg_dumpall -U postgres"`,
        (err, stream) => {
          if (err) {
            consola.error("Error executing SSH command", err);
            reject(err);
            return;
          }

          let dumpData = "";

          stream
            .on("data", (data: string) => {
              dumpData += data;
            })
            .on("close", (code: number, signal: string) => {
              if (code === 0) {
                resolve(dumpData);
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

    const dbData = await this.dumpPostgresSQL(database);

    if (!dbData) {
      consola.error("Failed to get db data");
      return;
    }

    const migratedPostgreSQL = await global.v4.createPostgreSQL(
      database.name,
      database.rootUser!,
      this.utils.decrypt(database.rootUserPassword!)!,
      database.defaultDatabase!,
      database.version,
      database.publicPort,
      [{ index: 0, filename: "migration.sql", content: dbData }]
    );

    consola.success("Migrated PostgreSQL", migratedPostgreSQL.name);

    const migratedVolume = await global.v4.createPostgresSQLVolume(
      migratedPostgreSQL.id,
      migratedPostgreSQL.uuid
    );

    consola.success("Migrated PostgreSQL Volume", migratedVolume.name);

    return migratedPostgreSQL;
  }
  // #endregion
}

export default V3;
