import consola from "consola";
import * as dotenv from "dotenv";
import { prompt } from "enquirer";
import FileTransfer from "./FileTransfer";
import { sleep } from "./utils";
import V3 from "./v3/client";
import V4 from "./v4/client";

dotenv.config();

async function Main() {
  global.dev =
    process.env.DEBUG === "true" || process.env.NODE_ENV === "development";

  const ClientV3 = new V3();
  const ClientV4 = new V4();
  const fileTransfer = new FileTransfer();

  global.transfer = fileTransfer;

  await MigrationMenu();
}

async function MigrationMenu() {
  console.clear();

  consola.info("Welcome to Coolify migrator");

  consola.warn(
    "This project is not affiliated with the Coolify project and author!"
  );

  consola.warn(
    "We assume no responsibility for errors or erroneous data transmitted during migration. You are 100% responsible that the migration may fail or that you may lose data."
  );

  await sleep(4500);

  const { type } = await prompt<{ type: "github" | "databases" | "dump" }>({
    type: "select",
    name: "type",
    message: "What do you want to migrate?",
    choices: [
      { message: "Migrate Sources - Github", name: "github" },
      { message: "Migrate Databases", name: "databases" },
      { message: "Dump Databases to Local", name: "dump" },
    ],
  });

  if (type === "github") {
    const githubSources = await global.v3.db.githubApp.findMany();

    const { source } = await prompt<{ source: string }>({
      type: "select",
      name: "source",
      message: "Select the github source to migrate",
      choices: githubSources.map((gitHub) => ({
        message: `${gitHub.name} ${global.dev ? `(${gitHub.id})` : ""}`,
        name: gitHub.id,
      })),
    });

    const selectedSource = githubSources.find((github) => github.id === source);

    if (!selectedSource) {
      consola.error("Couldn't find the source with id", source);
      process.exit();
    }

    console.clear();

    await global.v3.migrateGitHubSource(selectedSource);

    await GoHome();
  }

  if (type === "databases") {
    const allowedDatabases = ["postgresql"];
    const databases = await global.v3.db.database.findMany();

    const { db } = await prompt<{ db: string }>({
      type: "select",
      name: "db",
      message: "Select the database to migrate",
      choices: databases.map((database) => ({
        message: `${database.name} - ${database.type} ${
          global.dev ? `(${database.id})` : ""
        }`,
        name: database.id,
        disabled: !allowedDatabases.includes(database.type!),
      })),
    });

    const selectedDatabase = databases.find((database) => database.id === db);

    if (!selectedDatabase) {
      consola.error("Couldn't find the database with id", db);
      process.exit();
    }

    console.clear();

    await global.v3.migratePostgreSQL(selectedDatabase);

    await GoHome();
  }

  if (type === "dump") {
    const databases = await global.v3.db.database.findMany({
      where: { type: "postgresql" },
    });

    const { db } = await prompt<{ db: string }>({
      type: "select",
      name: "db",
      message: "Select the database to dump",
      choices: databases.map((database) => ({
        message: `${database.name} - ${database.type} ${
          global.dev ? `(${database.id})` : ""
        }`,
        name: database.id,
      })),
    });

    const selectedDatabase = databases.find((database) => database.id === db);

    if (!selectedDatabase) {
      consola.error("Couldn't find the database with id", db);
      process.exit();
    }

    console.clear();

    await global.v3.dumpPostgresSQL(selectedDatabase);

    consola.success(`Database ${selectedDatabase.name} dumped successfully.`);

    await GoHome();
  }
}

async function GoHome() {
  const { confirm } = await prompt<{ confirm: boolean }>({
    type: "confirm",
    name: "confirm",
    message: "Do you want to go back to main menu?",
  });

  if (!confirm) {
    process.exit();
  }

  await MigrationMenu();
}

Main();
