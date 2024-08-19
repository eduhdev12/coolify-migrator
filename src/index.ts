import * as dotenv from "dotenv";
import V3 from "./v3/client";
import V4 from "./v4/client";

dotenv.config();

async function Main() {
  const ClientV3 = new V3();
  const ClientV4 = new V4();

  await global.v3.migrateGitHub();
}

Main();
