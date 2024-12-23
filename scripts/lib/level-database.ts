import type { AbstractSublevel } from "abstract-level";
import { ClassicLevel, type DatabaseOptions } from "classic-level";
import * as R from "remeda";

const DB_KEYS = ["actors", "items", "journal", "macros", "tables"] as const;

export class LevelDatabase extends ClassicLevel<string, DBEntry> {
  #dbkey: DBKey;
  #embeddedKey: EmbeddedKey | null;

  #documentDb: Sublevel<DBEntry>;
  #foldersDb: Sublevel<DBFolder>;
  #embeddedDb: Sublevel<EmbeddedEntry> | null = null;

  constructor(location: string, options: LevelDatabaseOptions<DBEntry>) {
    const dbOptions = options.dbOptions ?? {
      keyEncoding: "utf8",
      valueEncoding: "json",
    };
    super(location, dbOptions);

    const { dbKey, embeddedKey } = this.#getDBKeys(options.packType);
    this.#dbkey = dbKey;
    this.#embeddedKey = embeddedKey;

    this.#documentDb = this.sublevel(dbKey, dbOptions);
    this.#foldersDb = this.sublevel(
      "folders",
      dbOptions
    ) as unknown as Sublevel<DBFolder>;
    if (this.#embeddedKey) {
      this.#embeddedDb = this.sublevel(
        `${this.#dbkey}.${this.#embeddedKey}`,
        dbOptions
      ) as unknown as Sublevel<EmbeddedEntry>;
    }
  }

  async createPack(docSources: DBEntry[], folders: DBFolder[]): Promise<void> {
    const isDoc = (source: unknown): source is EmbeddedEntry => {
      return R.isPlainObject(source) && "_id" in source;
    };
    const docBatch = this.#documentDb.batch();
    const embeddedBatch = this.#embeddedDb?.batch();
    for (const source of docSources) {
      if (this.#embeddedKey) {
        const embeddedDocs = source[this.#embeddedKey];
        if (Array.isArray(embeddedDocs)) {
          for (let i = 0; i < embeddedDocs.length; i++) {
            const doc = embeddedDocs[i];
            if (isDoc(doc) && embeddedBatch) {
              embeddedBatch.put(`${source._id}.${doc._id}`, doc);
              embeddedDocs[i] = doc._id ?? "";
            }
          }
        }
      }
      docBatch.put(source._id ?? "", source);
    }
    await docBatch.write();
    if (embeddedBatch?.length) {
      await embeddedBatch.write();
    }
    if (folders.length) {
      const folderBatch = this.#foldersDb.batch();
      for (const folder of folders) {
        folderBatch.put(folder._id, folder);
      }
      await folderBatch.write();
    }

    await this.close();
  }

  async getEntries(): Promise<{
    packSources: PackEntry[];
    folders: DBFolder[];
  }> {
    const packSources: PackEntry[] = [];
    for await (const [docId, source] of this.#documentDb.iterator()) {
      const embeddedKey = this.#embeddedKey;
      if (embeddedKey && source[embeddedKey] && this.#embeddedDb) {
        const embeddedDocs = await this.#embeddedDb.getMany(
          source[embeddedKey]?.map((embeddedId) => `${docId}.${embeddedId}`) ??
            []
        );
        source[embeddedKey] = embeddedDocs.filter(R.isTruthy);
      }
      packSources.push(source as PackEntry);
    }

    const folders: DBFolder[] = [];
    for await (const [_key, folder] of this.#foldersDb.iterator()) {
      folders.push(folder);
    }
    await this.close();

    return {
      packSources,
      folders: R.sortBy(
        folders,
        (f) => f.sort,
        (f) => f.name
      ),
    };
  }

  #getDBKeys(packType: CompendiumDocumentType): {
    dbKey: DBKey;
    embeddedKey: EmbeddedKey | null;
  } {
    const dbKey = ((): DBKey => {
      switch (packType) {
        case "JournalEntry":
          return "journal";
        case "RollTable":
          return "tables";
        default: {
          const key = `${packType.toLowerCase()}s`;
          if (!tupleHasValue(DB_KEYS, key))
            throw PackError(`Unkown Document type: ${packType}`);
          return key as DBKey;
        }
      }
    })();
    const embeddedKey = ((): EmbeddedKey | null => {
      switch (dbKey) {
        case "actors":
          return "items";
        case "journal":
          return "pages";
        case "tables":
          return "results";
        default:
          return null;
      }
    })();
    return { dbKey, embeddedKey };
  }
}

function tupleHasValue<T extends string>(t: readonly T[], value: string) {
  return (t as readonly string[]).includes(value);
}

type CompendiumDocumentType =
  | "Item"
  | "Actor"
  | "RollTable"
  | "Macro"
  | "JournalEntry";

type DBKey = (typeof DB_KEYS)[number];

type EmbeddedKey = "items" | "pages" | "results";

type Sublevel<T> = AbstractSublevel<
  ClassicLevel<string, T>,
  string | Buffer | Uint8Array,
  string,
  T
>;

type PackEntry = {
  name: string;
  type: string;
  img: string;
  system: Record<string, any>;
  _id: string;
  effects: any[];
  folder: string;
  ownership: Record<string, number>;
  _stats: Record<string, any>;
  sort: number;
};

type EmbeddedEntry = any;

type DBEntry = Omit<PackEntry, "pages" | "items" | "results"> & {
  folder?: string | null;
  items?: (EmbeddedEntry | string)[];
  pages?: (EmbeddedEntry | string)[];
  results?: (EmbeddedEntry | string)[];
};

interface DBFolder {
  name: string;
  sorting: string;
  folder: string | null;
  type: CompendiumDocumentType;
  _id: string;
  sort: number;
  color: string | null;
  flags: object;
  _stats: {
    systemId: string | null;
    systemVersion: string | null;
    coreVersion: string | null;
    createdTime: number | null;
    modifiedTime: number | null;
    lastModifiedBy: string | null;
  };
}

interface LevelDatabaseOptions<T> {
  packType: CompendiumDocumentType;
  dbOptions?: DatabaseOptions<string, T>;
}

const PackError = (message: string): void => {
  console.error(`Error: ${message}`);
  process.exit(1);
};
