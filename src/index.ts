import consola from "consola";
import * as dotenv from "dotenv";
import { prompt } from "enquirer";
import fs from "fs";
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

  const v3DbPath = `${__dirname}/../prisma/v3.db`;
  if (!fs.existsSync(v3DbPath)) {
    consola.error(
      "V3 database file not found. Please run yarn import:db script first."
    );
    process.exit(0);
  }

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

  const { type } = await prompt<{
    type:
      | "github"
      | "databases"
      | "dump"
      | "application"
      | "application-dump"
      | "service-dump";
  }>({
    type: "select",
    name: "type",
    message: "What do you want to migrate?",
    choices: [
      { message: "Migrate Sources - Github", name: "github" },
      { message: "Migrate Databases", name: "databases" },
      { message: "Dump Databases to Local", name: "dump" },
      { message: "Application", name: "application" },
      { message: "Dump application", name: "application-dump" },
      { message: "Dump services", name: "service-dump" },
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
    const allowedDatabases = ["postgresql", "mysql"];
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

    switch (selectedDatabase.type!) {
      case "postgresql":
        await global.v3.migratePostgreSQL(selectedDatabase);
        break;

      case "mysql":
        await global.v3.migrateMySQL(selectedDatabase);
        break;

      default:
        consola.error("Unsupported database type");
        break;
    }

    await GoHome();
  }

  if (type === "dump") {
    const allowedDatabases = ["postgresql", "mysql"];
    const databases = await global.v3.db.database.findMany();

    const { db } = await prompt<{ db: string }>({
      type: "select",
      name: "db",
      message: "Select the database to dump",
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

    switch (selectedDatabase.type!) {
      case "postgresql":
        await global.v3.dumpPostgresSQL(selectedDatabase);
        break;

      case "mysql":
        await global.v3.dumpMySQL(selectedDatabase);
        break;

      default:
        consola.error("Unsupported database type");
        break;
    }

    consola.success(`Database ${selectedDatabase.name} dumped successfully.`);

    await GoHome();
  }

  if (type === "application") {
    const applications = await global.v3.db.application.findMany({});

    const { app } = await prompt<{ app: string }>({
      type: "select",
      name: "app",
      message: "Select the application to migrate",
      choices: applications.map((application) => ({
        message: `${application.name} - ${application.buildPack} | ${
          application.repository
        }-${application.branch} ${global.dev ? `(${application.id})` : ""}`,
        name: application.id,
      })),
    });

    const selectedApplication = applications.find(
      (application) => application.id === app
    );

    if (!selectedApplication) {
      consola.error("Couldn't find the application with id", app);
      process.exit();
    }

    console.clear();

    await global.v3.migrateApplication(selectedApplication.id);

    consola.success(
      `Migrated application ${selectedApplication.name} successfully.`
    );

    await GoHome();
  }

  if (type === "application-dump") {
    const applications = await global.v3.db.application.findMany({});

    const { app } = await prompt<{ app: string }>({
      type: "select",
      name: "app",
      message: "Select the application to dump",
      choices: applications.map((application) => ({
        message: `${application.name} - ${application.buildPack} | ${
          application.repository
        }-${application.branch} ${global.dev ? `(${application.id})` : ""}`,
        name: application.id,
      })),
    });

    const selectedApplication = applications.find(
      (application) => application.id === app
    );

    if (!selectedApplication) {
      consola.error("Couldn't find the application with id", app);
      process.exit();
    }

    console.clear();

    await global.v3.dumpApplication(selectedApplication.id);

    consola.success(
      `Dumped application ${selectedApplication.name} successfully.`
    );

    await GoHome();
  }

  if (type === "service-dump") {
    const allowedServices = ["wordpress"];
    const services = await global.v3.db.service.findMany({});

    const { service } = await prompt<{ service: string }>({
      type: "select",
      name: "service",
      message: "Select the service to dump",
      choices: services.map((service) => ({
        message: `${service.name} - ${service.type} ${
          global.dev ? `(${service.id})` : ""
        }`,
        name: service.id,
        disabled: !allowedServices.includes(service.type!),
      })),
    });

    const selectedService = services.find((s) => s.id === service);

    if (!selectedService) {
      consola.error("Couldn't find the service with id", service);
      process.exit();
    }

    console.clear();

    await global.v3.dumpServiceVolume(selectedService.id);

    consola.success(`Dumped service ${selectedService.name} successfully.`);

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
