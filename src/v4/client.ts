import { createId } from "@paralleldrive/cuid2";
import consola from "consola";
import knex, { Knex } from "knex";

class V4 {
  public db: Knex<any, unknown[]>;

  // This will be changed after
  private team: number = 0;

  constructor() {
    this.db = knex({ client: "pg", connection: process.env.V4_DATABASE! });

    consola.success("Connected to v4 database");

    global.v4 = this;
  }

  // Github migration
  async createPrivateKey(name: string, key: string) {
    try {
      const [privateKey] = await this.db("private_keys").returning("*").insert<any>({
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

    const [gitHubSource] = await this.db("github_apps").returning("*").insert<any>({
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
}

export default V4;
