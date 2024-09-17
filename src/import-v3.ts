import * as dotenv from "dotenv";
import V3 from "./v3/client";
import FileTransfer from "./FileTransfer";

dotenv.config();

async function Import() {
  const ClientV3 = new V3();
  const fileTransfer = new FileTransfer();

  global.transfer = fileTransfer;

  await ClientV3.getDatabase();

  process.exit(0);
}

Import();
