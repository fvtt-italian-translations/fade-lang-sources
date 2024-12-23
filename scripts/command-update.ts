import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { PackType, readModuleJson } from "./lib/read-module-json";

export async function commandUpdate(source: string, extracted: string) {
  await mkdir(resolve("compendium"), { recursive: true }).catch(() =>
    Promise.resolve()
  );

  const moduleJsonPath = dirname(source);
  const moduleJson = await readModuleJson(moduleJsonPath);

  const packsWithData: PackWithEntries[] = await Promise.all(
    moduleJson.packs.map(async (pack) => {
      const extractedFilePath = resolve(extracted, pack.name + ".json");
      const entries: BaseEntry[] = JSON.parse(
        await readFile(extractedFilePath, "utf-8")
      );
      return { ...pack, entries };
    })
  );

  const packsMap = new Map(packsWithData.map((p) => [p.name, p]));

  for (const pack of packsWithData) {
    switch (pack.type) {
      case "Actor":
        await handleActor(pack, pack.entries as any[]);
        break;
      case "Item":
        await handleItem(pack, pack.entries as any[]);
        break;
      case "Macro":
        await handleMacro(pack, pack.entries as any[]);
        break;
      case "RollTable":
        await handleRollTable(pack, pack.entries as any[]);
        break;
    }
  }
}

async function handleActor(pack: PackType, entries: EntryActor[]) {
  const out: Compendium = {
    label: pack.label,
    entries: {},
  };

  for (const entry of entries) {
    const outEntry: TranslationStrings = (out.entries[entry.name] = {});
    outEntry.name = entry.name;
    if (entry.system.biography) {
      outEntry.biography = entry.system.biography;
    }

    for (const item of entry.items) {
      if (
        item._stats.compendiumSource &&
        item._stats.compendiumSource.startsWith("Compendium/")
      ) {
        // TODO: check
        continue;
      }

      const outItem = ((outEntry.items ??= {})[item._id] =
        {} as TranslationStrings);
      outItem.name = item.name;
      if (item.system.description) {
        outItem.description = item.system.description;
      }
    }
  }

  const outData = JSON.stringify(out, orderKeysReplacer, 2);
  await writeFile(join("compendium", pack.name + ".json"), outData);
}

async function handleItem(pack: PackType, entries: EntryItem[]) {
  const out: Compendium = {
    label: pack.label,
    entries: {},
  };

  for (const entry of entries) {
    const outEntry: TranslationStrings = (out.entries[entry.name] = {});
    outEntry.name = entry.name;
  }

  const outData = JSON.stringify(out, orderKeysReplacer, 2);
  await writeFile(join("compendium", pack.name + ".json"), outData);
}

async function handleMacro(pack: PackType, entries: any) {}

async function handleRollTable(pack: PackType, entries: any) {}

type TranslationStrings = {
  [P in string]: string | TranslationStrings;
};

interface PackWithEntries extends PackType {
  entries: BaseEntry[];
}

interface Compendium {
  label: string;
  mapping?: Record<string, string | { path: string; converter: string }>;
  entries: TranslationStrings;
}

interface BaseEntry {
  _id: string;
  _stats: {
    compendiumSource?: string;
  };
  flags: Record<string, any>;
  name: string;
  img: string;
}

interface EntryEmbeddedItem extends BaseEntry {
  type: "weapon" | "specialAbility" | "armor";
  system: {
    tags: any[];
    description: string;
    gm: {
      notes: string;
    };
  };
}

interface EntryActor extends BaseEntry {
  system: {
    details: {
      alignment: string;
      size: string;
      monsterType: string;
    };
    biography: string;
    encumbrance: {
      label: string;
      desc: string;
    };
  };
  prototypeToken: {
    name: string;
  };
  items: EntryEmbeddedItem[];
}

interface EntryItem extends BaseEntry {
  system: {};
}

function orderKeysReplacer(key: string, value: any) {
  if (value instanceof Object && !(value instanceof Array)) {
    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = value[key];
        return sorted;
      }, {} as any);
  }
  return value;
}
