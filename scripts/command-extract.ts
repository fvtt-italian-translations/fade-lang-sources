import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { LevelDatabase } from "./lib/level-database";
import { readModuleJson } from "./lib/read-module-json";

export async function commandExtract(source: string, extracted: string) {
  const moduleJsonPath = dirname(source);
  const moduleJson = await readModuleJson(moduleJsonPath);

  await mkdir(extracted, { recursive: true }).catch(() => Promise.resolve());

  for (const pack of moduleJson.packs) {
    const packDir = join(moduleJsonPath, pack.path.replace(/\.db$/, ""));
    console.log(`extracting ${pack.name} (${pack.type})`);
    const db = new LevelDatabase(packDir, { packType: pack.type });

    const { packSources, folders } = await db.getEntries();

    const outFolderFile = resolve(extracted, pack.name + "_folders.json");
    await writeFile(outFolderFile, prettyPrintJSON(folders), "utf-8");

    const outFile = resolve(extracted, pack.name + ".json");
    const outData = JSON.stringify(packSources);
    await writeFile(outFile, outData, "utf-8");
  }
}

function prettyPrintJSON(object: object): string {
  const idPattern = /^[a-z0-9]{20,}$/g;
  const allKeys: Set<string> = new Set();
  const idKeys: string[] = [];

  JSON.stringify(object, (key, value) => {
    if (idPattern.test(key)) {
      idKeys.push(key);
    } else {
      allKeys.add(key);
    }

    return value;
  });

  const sortedKeys = Array.from(allKeys).sort().concat(idKeys);
  const newJson = JSON.stringify(object, sortedKeys, 4);

  return `${newJson}\n`;
}
