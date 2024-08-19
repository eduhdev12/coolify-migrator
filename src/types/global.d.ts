import { PrismaClient } from "@prisma/client";
import { Client } from "../client";
import V3 from "../v3/client";
import V4 from "../v4/client";

declare global {
  var dev: boolean;
  var v3: V3;
  var v4: V4;
}

export {};
