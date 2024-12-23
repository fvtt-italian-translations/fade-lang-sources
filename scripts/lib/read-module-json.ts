import { readFile } from "fs/promises";
import { join } from "path";

export async function readModuleJson(source: string) {
  const moduleJsonRaw = await readFile(join(source, "./module.json"), "utf-8");
  return JSON.parse(moduleJsonRaw) as {
    packs: PackType[];
  };
}

export type PackType = {
  name: string;
  label: string;
  system: string;
  path: string;
  type: "Item" | "Actor" | "RollTable" | "Macro";
};
