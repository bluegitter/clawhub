/* eslint-disable */
/**
 * Minimal data model compatibility shim.
 *
 * The local backend no longer uses Convex tables directly, but parts of the
 * frontend still reference `Doc<T>` / `Id<T>` type helpers. Keep them
 * structurally permissive until those imports are migrated away.
 */

export type TableNames = string;
export type Id<TableName extends string> = string & { __tableName?: TableName };
export type Doc<TableName extends string> = Record<string, any> & {
  _id: Id<TableName>;
  _creationTime?: number;
};
export type DataModel = Record<string, never>;
