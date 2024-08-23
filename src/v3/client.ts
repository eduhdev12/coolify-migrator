import { Database, GithubApp, PrismaClient } from "@prisma/client";
import consola from "consola";
import V3Utils from "./utils";

class V3 {
  public db: PrismaClient;
  public utils: V3Utils = new V3Utils();

  constructor() {
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

    const migratedPostgreSQL = await global.v4.createPostgreSQL(
      database.name,
      database.rootUser!,
      this.utils.decrypt(database.rootUserPassword!)!,
      database.defaultDatabase!,
      database.version,
      database.publicPort
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
