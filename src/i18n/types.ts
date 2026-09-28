import type { ar } from "./messages/ar";

/** A pluralised message: Arabic fills all six CLDR categories, English needs `one` + `other`. */
export interface PluralMessage {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** Same shape as the Arabic catalogue, with every leaf widened to string (or a plural object). */
type Widen<T> = T extends string ? string : T extends { other: string } ? PluralMessage : { [K in keyof T]: Widen<T[K]> };

/** Every catalogue must have exactly the Arabic catalogue's keys — a missing or extra key is a type error. */
export type Messages = Widen<typeof ar>;

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;

type StringKeys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? Join<P, K> : T[K] extends { other: string } ? never : StringKeys<T[K], Join<P, K>>;
}[keyof T & string];

type PluralKeys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? never : T[K] extends { other: string } ? Join<P, K> : PluralKeys<T[K], Join<P, K>>;
}[keyof T & string];

/** Dotted path of a plain (non-plural) message, e.g. "shell.nav.flows". */
export type MessageKey = StringKeys<Messages>;
/** Dotted path of a pluralised message, e.g. "flows.nodes". */
export type PluralKey = PluralKeys<Messages>;

export type Vars = Record<string, string | number>;
