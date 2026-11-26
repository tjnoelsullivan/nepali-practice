import type { Item, Sentence } from '../core/types'
import deck from './deck.json'

/**
 * Built-in deck, generated from content/deck.txt by scripts/build-deck.mjs.
 * Tutor sentences are verified; new family sentences are unverified until TJ's tutor checks them.
 * Spelling follows TJ's house style: "chha", "tapaai".
 */
export const STARTER_ITEMS = deck.items as Item[]
export const STARTER_SENTENCES = deck.sentences as Sentence[]
