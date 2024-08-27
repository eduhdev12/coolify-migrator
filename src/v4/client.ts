import { createId } from "@paralleldrive/cuid2";
import { Database } from "@prisma/client";
import axios from "axios";
import consola from "consola";
import fsSync from "fs";
import knex, { Knex } from "knex";
import { Client as SSHClient } from "ssh2";

// @ts-ignore: Library without typescript support
import { Encryptor } from "node-laravel-encryptor";

class V4 {
  public db: Knex<any, unknown[]>;
  public encryptor = new Encryptor({
    key: process.env.V4_SECRET_KEY!.split(":")?.[1],
  });
  public ssh: SSHClient;
  private endpoint: string;
  private API_KEY: string;

  // This will be changed after
  private team: number = 0;
  private docker: number = 0;
  private network: string = "coolify";
  private enviorment: number = 1;

  constructor() {
    this.db = knex({ client: "pg", connection: process.env.V4_DATABASE! });

    this.ssh = new SSHClient()
      .connect({
        host: process.env.V4_HOST!,
        port: Number(process.env.V4_PORT),
        username: process.env.V4_USER!,
        password: process.env.V4_PASSWORD,
        privateKey: fsSync.readFileSync("/Users/eduh/.orbstack/ssh/id_ed25519"),
      })
      .on("ready", () => {
        consola.success("Connected to v4 SSH");
      });

    this.endpoint = process.env.V4_ENDPOINT!;
    this.API_KEY = process.env.V4_API_KEY!;

    consola.success("Connected to v4 database");

    global.v4 = this;
  }

  // #region: GitHub
  async createPrivateKey(name: string, key: string) {
    try {
      const [privateKey] = await this.db("private_keys")
        .returning("*")
        .insert<any>({
          uuid: createId(),
          name,
          private_key: key,
          is_git_related: true,
          team_id: this.team,
        });

      return privateKey;
    } catch (error) {
      consola.error("Failed to create private-key", error);

      process.exit();
    }
  }

  async createGitHub(
    name: string,
    app_id: number,
    installation_id: number,
    client_id: string,
    client_secret: string,
    webhook_secret: string,
    private_key: number
  ) {
    const clientSecret = global.v3.utils.decrypt(client_secret);
    const webhookSecret = global.v3.utils.decrypt(webhook_secret);

    if (!clientSecret || !webhookSecret) {
      return consola.error(
        "Invalid client secret or webhook secret",
        client_secret,
        webhook_secret
      );
    }

    const [gitHubSource] = await this.db("github_apps")
      .returning("*")
      .insert<any>({
        uuid: createId(),
        name,
        api_url: "https://api.github.com",
        html_url: "https://github.com",
        custom_user: "git",
        custom_port: 22,
        app_id,
        installation_id,
        client_id,
        client_secret: clientSecret,
        webhook_secret: webhookSecret,
        private_key_id: private_key,
        team_id: this.team,
      });

    return gitHubSource;
  }
  // #endregion

  async startDatabase(uuid: string) {
    const req = await axios.get(
      `${this.endpoint}/api/v1/databases/${uuid}/start`,
      { headers: { Authorization: `Bearer ${this.API_KEY}` } }
    );

    if (req.status !== 200) {
      consola.error("Failed to start database", uuid, req.data);
      return false;
    }

    consola.success("Started database", uuid);
    return true;
  }

  //#region PostgreSQL
  async createPostgreSQL(
    name: string,
    postgres_user: string,
    postgres_password: string,
    postgres_db: string,
    version: string | null,
    public_port: number | null
  ) {
    const [postgreSQL] = await this.db("standalone_postgresqls")
      .returning("*")
      .insert<any>({
        uuid: createId(),
        name,
        postgres_user,
        postgres_password: this.encryptor.encryptSync(postgres_password),
        postgres_db,
        // image: `postgres:${version || "16-alpine"}`,
        image: `bitnami/postgresql:${version}`,
        destination_type: "App\\Models\\StandaloneDocker",
        created_at: new Date(),
        updated_at: new Date(),
        destination_id: this.docker,
        environment_id: this.enviorment,
        public_port,
        is_public: !!public_port,
      });

    return postgreSQL;
  }

  async importPogresSQL(database: Database, uuid: string) {
    await global.transfer.uploadDirectory(
      `${__dirname}/../../data/${database.id}`,
      `/tmp/v4-migrate/${uuid}`,
      true,
      async () => {
        return new Promise<void>((resolve, reject) => {
          this.ssh.exec(
            // `docker exec ${database.id} sh -c "PGPASSWORD=${rootPassword} pg_dumpall -U postgres"`,
            `docker cp /tmp/v4-migrate/${uuid}/${database.id}.dmp ${uuid}:/tmp/${database.id}.dmp && docker exec ${uuid} sh -c 'PGPASSWORD=$POSTGRES_PASSWORD pg_restore -U $POSTGRES_USER -d $POSTGRES_DB /tmp/${database.id}.dmp'`,
            (err, stream) => {
              console.log("executing thiss");
              if (err) {
                consola.error("Error executing SSH command", err);
                reject();
                return;
              }

              stream
                .on("data", async (data: string) => {
                  console.log("data", data);
                })
                .on("close", (code: number, signal: string) => {
                  consola.success("Imported databse dump", uuid);
                  resolve();
                });
              // .stderr.on("data", (data) => {
              //   consola.error("STDERR: " + data);
              // });
            }
          );
        });
      }
    );
  }

  async createPostgresSQLVolume(id: number, uuid: string) {
    const [postgreSQLVolume] = await this.db("local_persistent_volumes")
      .returning("*")
      .insert<any>({
        name: `postgres-data-${uuid}`,
        mount_path: "/var/lib/postgresql/data",
        resource_type: "App\\Models\\StandalonePostgresql",
        resource_id: id,
        created_at: new Date(),
        updated_at: new Date(),
        is_readonly: true,
      });

    return postgreSQLVolume;
  }
  //#endregion
}

export default V4;
