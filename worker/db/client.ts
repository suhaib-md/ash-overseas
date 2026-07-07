import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/** A Drizzle client bound to a D1 database. */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof getDb>;
