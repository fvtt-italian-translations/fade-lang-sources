import { mkdir, readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { mergeAll } from "remeda";
import { PackType, readModuleJson, readSystemJson } from "./lib/read-json";

export async function commandUpdate(
  systemPath: string,
  compendiumPath: string,
  extracted: string
) {
  await mkdir(resolve("compendium"), { recursive: true }).catch(() =>
    Promise.resolve()
  );

  const [systemJson, moduleJson] = await Promise.all([
    readSystemJson(systemPath),
    readModuleJson(compendiumPath),
  ]);

  const allLangs = await Promise.all(
    systemJson.languages
      .filter((language) => language.lang === "en")
      .map(async (language) => {
        const path = join(systemPath, language.path);
        const file = await readFile(path, "utf-8");
        return JSON.parse(file);
      })
  );

  const langData = mergeAll([{}, ...allLangs]) as TranslationStrings;

  await writeFile("./en.json", JSON.stringify(langData, null, 2));

  const packsWithData: PackWithData[] = await Promise.all(
    moduleJson.packs.map(async (pack) => {
      const extractedFilePath = resolve(extracted, pack.name + ".json");
      const folderFilePath = resolve(extracted, pack.name + "_folders.json");

      const entries: BaseEntry[] = JSON.parse(
        await readFile(extractedFilePath, "utf-8")
      );

      const folders: FolderEntry[] = JSON.parse(
        await readFile(folderFilePath, "utf-8")
      );

      return { ...pack, entries, folders };
    })
  );

  const packsMap = new Map(packsWithData.map((p) => [p.name, p]));

  for (const pack of packsWithData) {
    switch (pack.type) {
      case "Actor":
        await handleActor(pack as any);
        break;
      case "Item":
        await handleItem(pack as any);
        break;
      case "Macro":
        await handleMacro(pack as any);
        break;
      case "RollTable":
        await handleRollTable(pack as any);
        break;
    }
  }
}

async function handlePackFolders(pack: PackWithData, out: Compendium) {
  for (const folder of pack.folders) {
    (out.folders ??= {})[folder.name] = folder.name;
  }
}

async function handleActor(pack: PackWithData<EntryActor>) {
  const out: Compendium = {
    label: pack.label,
    folders: {},
    entries: {},
  };

  await handlePackFolders(pack, out);

  for (const entry of pack.entries) {
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

async function handleItem(pack: PackWithData<EntryItem>) {
  const out: Compendium = {
    label: pack.label,
    folders: {},
    entries: {},
  };

  await handlePackFolders(pack, out);

  for (const entry of pack.entries) {
    const outEntry: TranslationStrings = (out.entries[entry.name] = {});
    outEntry.name = entry.name;
    if (entry.system.description) {
      outEntry.description = entry.system.description;
    }
    if (entry.system.gm?.notes) {
      outEntry.gmNotes = entry.system.gm.notes;
    }
  }

  const outData = JSON.stringify(out, orderKeysReplacer, 2);
  await writeFile(join("compendium", pack.name + ".json"), outData);
}

async function handleMacro(pack: PackWithData<any>) {
  const out: Compendium = {
    label: pack.label,
    folders: {},
    entries: {},
  };

  await handlePackFolders(pack, out);

  for (const entry of pack.entries) {
    const outEntry: TranslationStrings = (out.entries[entry.name] = {});
    outEntry.name = entry.name;
  }

  const outData = JSON.stringify(out, orderKeysReplacer, 2);
  await writeFile(join("compendium", pack.name + ".json"), outData);
}

async function handleRollTable(pack: PackWithData<any>) {
  const out: Compendium = {
    label: pack.label,
    folders: {},
    entries: {},
  };

  await handlePackFolders(pack, out);

  for (const entry of pack.entries) {
    const outEntry: TranslationStrings = (out.entries[entry.name] = {});
    outEntry.name = entry.name;
  }

  const outData = JSON.stringify(out, orderKeysReplacer, 2);
  await writeFile(join("compendium", pack.name + ".json"), outData);
}

type TranslationStrings = {
  [P in string]: string | TranslationStrings;
};

interface PackWithData<TData extends BaseEntry = BaseEntry> extends PackType {
  entries: TData[];
  folders: FolderEntry[];
}

interface Compendium {
  label: string;
  mapping?: Record<string, string | { path: string; converter: string }>;
  entries: TranslationStrings;
  folders?: Record<string, string>;
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
  system: {
    tags: any[];
    description: string;
    gm?: {
      notes: string;
    };
  };
}

interface FolderEntry extends BaseEntry {}

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
