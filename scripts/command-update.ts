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

  const common: TranslationStrings = {
    spellRange: Object.fromEntries(commonSpellRange.map((x) => [x, x])),
    spellDuration: Object.fromEntries(commonSpellDuration.map((x) => [x, x])),
  };

  for (const pack of packsWithData) {
    switch (pack.type) {
      case "Actor":
        await handleActor(pack as any, common);
        break;
      case "Item":
        await handleItem(pack as any, common);
        break;
      case "Macro":
        await handleMacro(pack as any);
        break;
      case "RollTable":
        await handleRollTable(pack as any);
        break;
    }
  }

  langData["FADE_TRANSLATIONS"] = common;

  await writeFile("./en.json", JSON.stringify(langData, orderKeysReplacer, 2));
}

async function handlePackFolders(pack: PackWithData, out: Compendium) {
  for (const folder of pack.folders) {
    (out.folders ??= {})[folder.name] = folder.name;
  }
}

function getEntry(out: Compendium, entry: BaseEntry): TranslationStrings {
  const newEntry: TranslationStrings = { _id: entry._id };
  const previous = out.entries[entry.name];
  if (previous) {
    out.entries[entry.name] = Array.isArray(previous)
      ? [...previous, newEntry]
      : [previous, newEntry];
    return newEntry;
  }
  out.entries[entry.name] = newEntry;
  return newEntry;
}

async function handleActor(
  pack: PackWithData<EntryActor>,
  common: TranslationStrings
) {
  const out: Compendium = {
    label: pack.label,
    folders: {},
    entries: {},
  };

  await handlePackFolders(pack, out);

  for (const entry of pack.entries) {
    const outEntry = getEntry(out, entry);
    outEntry.name = entry.name;
    if (entry.system.biography) {
      outEntry.biography = entry.system.biography;
    }
    if (entry.system.gm.notes) {
      outEntry.gmNotes = entry.system.gm.notes;
    }
    if (entry.type === "monster") {
      if (entry.system.details.alignment) {
        const monsterAlignment = (common.monsterAlignment ??=
          {}) as TranslationStrings;
        monsterAlignment[entry.system.details.alignment] =
          entry.system.details.alignment;
      }
      if (entry.system.details.monsterType) {
        outEntry.monsterType = entry.system.details.monsterType;
      }
      if (entry.system.details.size) {
        const monsterSize = (common.monsterSize ??= {}) as TranslationStrings;
        monsterSize[entry.system.details.size] = entry.system.details.size;
      }
    }

    for (const item of entry.items) {
      if (
        item._stats.compendiumSource &&
        item._stats.compendiumSource.startsWith("Compendium/")
      ) {
        // TODO: check
        continue;
      }

      const outItems = (outEntry.items ??= {}) as TranslationStrings;
      const outItem = (outItems[item._id] = {} as TranslationStrings);
      handleItemEmbed(outItem, item, common);
    }
  }

  await exportPack(out, pack.name);
}

const commonSpellRange = ["Touch", "Personal"];
function isCommonSpellRange(range: string) {
  return range.match(/^\d+'?$/) || commonSpellRange.includes(range);
}

const commonSpellDuration = ["Instantaneous", "Permanent", "Concentration"];
function isCommonSpellDuration(duration: string) {
  return (
    duration.match(/^\d+ (round|turn|day|hour)s?$/) ||
    commonSpellDuration.includes(duration)
  );
}

function handleItemEmbed(
  outEntry: TranslationStrings,
  entry: EntryItem,
  common: TranslationStrings
) {
  outEntry.name = entry.name;
  if (entry.system.description) {
    outEntry.description = entry.system.description;
  }
  if (entry.system.shortName) {
    outEntry.shortName = entry.system.shortName;
  }
  if (entry.system.gm?.notes) {
    outEntry.gmNotes = entry.system.gm.notes;
  }
  if (entry.system.unidentifiedName) {
    outEntry.unidentifiedName = entry.system.unidentifiedName;
  }
  if (entry.system.unidentifiedDesc) {
    outEntry.unidentifiedDesc = entry.system.unidentifiedDesc;
  }
  if (entry.type === "spell") {
    if (entry.system.range && !isCommonSpellRange(entry.system.range)) {
      outEntry.spellRange = entry.system.range;
    }
    if (
      entry.system.duration &&
      !isCommonSpellDuration(entry.system.duration)
    ) {
      outEntry.spellDuration = entry.system.duration;
    }
    if (entry.system.effect) {
      outEntry.spellEffect = entry.system.effect;
    }
  }
  if (entry.type === "class") {
    if (entry.system.alignment) {
      const classAlignment = (common.classAlignment ??=
        {}) as TranslationStrings;
      classAlignment[entry.system.alignment] = entry.system.alignment;
    }
    if (entry.system.species) {
      const classSpecies = (common.classSpecies ??= {}) as TranslationStrings;
      classSpecies[entry.system.species] = entry.system.species;
    }
    for (const [index, level] of entry.system.levels.entries()) {
      const classLevels = (outEntry.classLevels ??= {}) as TranslationStrings;
      const classLevel = (classLevels[`${index}`] ??= {}) as TranslationStrings;
      if (level.title) {
        classLevel.title = level.title;
      }
    }
    for (const [index, ability] of entry.system.specialAbilities.entries()) {
      const specialAbilities = (outEntry.specialAbilities ??=
        {}) as TranslationStrings;
      const specialAbility = (specialAbilities[`${index}`] ??=
        {}) as TranslationStrings;
      if (ability.name) {
        specialAbility.name = ability.name;
      }
    }
    for (const [index, item] of entry.system.classItems.entries()) {
      const classItems = (outEntry.classItems ??= {}) as TranslationStrings;
      const classItem = (classItems[`${index}`] ??= {}) as TranslationStrings;
      if (item.name) {
        classItem.name = item.name;
      }
    }
  }
  if (entry.type === "weapon") {
    if (entry.system.mastery) {
      outEntry.weaponMastery = entry.system.mastery;
    }
  }
}

async function handleItem(
  pack: PackWithData<EntryItem>,
  common: TranslationStrings
) {
  const out: Compendium = {
    label: pack.label,
    folders: {},
    entries: {},
  };

  await handlePackFolders(pack, out);

  for (const entry of pack.entries) {
    const outEntry = getEntry(out, entry);
    handleItemEmbed(outEntry, entry, common);
  }

  await exportPack(out, pack.name);
}

async function handleMacro(pack: PackWithData<any>) {
  const out: Compendium = {
    label: pack.label,
    folders: {},
    entries: {},
  };

  await handlePackFolders(pack, out);

  for (const entry of pack.entries) {
    const outEntry = getEntry(out, entry);
    outEntry.name = entry.name;
  }

  await exportPack(out, pack.name);
}

async function handleRollTable(pack: PackWithData<any>) {
  const out: Compendium = {
    label: pack.label,
    folders: {},
    entries: {},
  };

  await handlePackFolders(pack, out);

  for (const entry of pack.entries) {
    const outEntry = getEntry(out, entry);
    outEntry.name = entry.name;
  }

  await exportPack(out, pack.name);
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
  entries: Record<string, TranslationStrings | TranslationStrings[]>;
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

interface EntryActorBase extends BaseEntry {
  prototypeToken: {
    name: string;
  };
  items: EntryItem[];
}

interface SystemActorBase {
  biography: string;
  encumbrance: {
    label: string;
    desc: string;
  };
  languages: string;
  gm: { notes: "" };
}

interface EntryActorMonster extends EntryActorBase {
  type: "monster";
  system: SystemActorBase & {
    details: {
      alignment: string;
      size: string;
      monsterType: string;
    };
  };
}

interface EntryActorCharacter extends EntryActorBase {
  type: "character";
  system: SystemActorBase & {
    details: {
      alignment: string;
      class: string;
      species: string;
      title: string;
      sex: string;
      height: string;
      weight: string;
      eyes: string;
      hair: string;
    };
  };
}

type EntryActor = EntryActorMonster | EntryActorCharacter;

interface EntryItemBase extends BaseEntry {}

interface SystemItemBase {
  description: string;
  gm: { notes: "" };
  shortName?: string;
  unidentifiedName?: string;
  unidentifiedDesc?: string;
  fuelType: string;
  ammoType: string;
}

interface EntryItemItem extends EntryItemBase {
  type: "item";
  system: SystemItemBase & {};
}

interface EntryItemArmor extends EntryItemBase {
  type: "armor";
  system: SystemItemBase & {};
}

interface EntryItemSkill extends EntryItemBase {
  type: "skill";
  system: SystemItemBase & {};
}

interface EntryItemLight extends EntryItemBase {
  type: "light";
  system: SystemItemBase & {
    light: {
      radius: number;
    };
  };
}

interface EntryItemSpell extends EntryItemBase {
  type: "spell";
  system: SystemItemBase & {
    range: string;
    duration: string;
    effect: string;
  };
}

interface EntryItemWeapon extends EntryItemBase {
  type: "weapon";
  system: SystemItemBase & {
    mastery: string;
    range: {
      long?: number;
      medium?: number;
      short?: number;
    };
  };
}

interface EntryItemMastery extends EntryItemBase {
  type: "mastery";
  system: SystemItemBase & {};
}

interface EntryItemClass extends EntryItemBase {
  type: "class";
  system: SystemItemBase & {
    species: string;
    alignment: string;
    levels: {
      title: string;
      femaleTitle: string;
    }[];
    specialAbilities: {
      name: string;
    }[];
    classItems: {
      name: string;
    }[];
  };
}

interface EntryItemWeaponMastery extends EntryItemBase {
  type: "weaponMastery";
  system: SystemItemBase & {
    levels: {
      special: string;
      range: {
        long?: number;
        medium?: number;
        short?: number;
      };
    }[];
  };
}

interface EntryItemSpecialAbility extends EntryItemBase {
  type: "specialAbility";
  system: SystemItemBase & {};
}

type EntryItem =
  | EntryItemItem
  | EntryItemArmor
  | EntryItemSkill
  | EntryItemLight
  | EntryItemSpell
  | EntryItemWeapon
  | EntryItemMastery
  | EntryItemClass
  | EntryItemWeaponMastery
  | EntryItemSpecialAbility;

interface FolderEntry extends BaseEntry {}

async function exportPack(out: Compendium, name: string) {
  // fix duplicates
  for (const [key, entry] of Object.entries(out.entries)) {
    if (!Array.isArray(entry)) {
      delete entry._id;
      continue;
    }
    console.warn(
      `pack ${name}, duplicated entry: ${key} (${entry.length} times)`
    );
    delete out.entries[key];
    for (const e of entry) {
      out.entries[`${key}@${e._id}`] = e;
      delete e._id;
    }
  }
  const outData = JSON.stringify(out, orderKeysReplacer, 2);
  await writeFile(join("compendium", name + ".json"), outData);
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
