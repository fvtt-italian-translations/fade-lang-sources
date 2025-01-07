import "dotenv/config";

import { resolve } from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { commandExtract } from "./command-extract";
import { commandUpdate } from "./command-update";

yargs(hideBin(process.argv))
  .command(
    "update <system> <compendium> <extracted>",
    "update the sources",
    (yargs) =>
      yargs
        .positional("system", { type: "string", demandOption: true })
        .positional("compendium", { type: "string", demandOption: true })
        .positional("extracted", { type: "string", demandOption: true }),
    async (argv) => {
      const system = resolve(argv.system);
      const compendium = resolve(argv.compendium);
      const extracted = resolve(argv.extracted);
      console.log(`updating sources using packs from ${extracted}`);
      await commandUpdate(system, compendium, extracted);
    }
  )
  .command(
    "extract <source> <extracted>",
    "extract the compendium files",
    (yargs) =>
      yargs
        .positional("source", { type: "string", demandOption: true })
        .positional("extracted", { type: "string", demandOption: true }),
    async (argv) => {
      const source = resolve(argv.source);
      const extracted = resolve(argv.extracted);
      console.log(`extracting packs from ${source} to ${extracted}`);
      await commandExtract(source, extracted);
    }
  )
  .strictCommands()
  .demandCommand(1)
  .parse();
