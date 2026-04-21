/**
 * Shared types. The client mirrors these in /client/src/lib/types.ts.
 * Keep the two files in lockstep — the wire protocol is this shape.
 */

export const SCHEMA_VERSION = 1 as const;

export type HullTier = 'light' | 'medium' | 'heavy';

export type Ship = {
  name: string;
  class: string;
  hp: number;
  maxHp: number;
  hullTier: HullTier;
  speed: number;
  agility: number;
  skill: number;
  broadsides: number;
  smallArms: number;
  ram: number;
  crewCount: number;
  minCrew: number;
  maxCrew: number;
  cargoMax: number;
  upgrades: string[];
  shanties: string[];
  notes: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  notes: string;
};

export type Character = {
  id: string;
  name: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  agility: number;
  presence: number;
  strength: number;
  toughness: number;
  spirit: number;
  silver: number;
  devilsLuck: number;
  conditions: string[];
  featureNotes: string;
  inventory: InventoryItem[];
};

export type CargoItem = {
  id: string;
  name: string;
  slots: number;
  notes: string;
};

export type RelicStatus = 'active' | 'depleted' | 'destroyed';

export type Relic = {
  id: string;
  name: string;
  description: string;
  usesLeft: number | null;
  status: RelicStatus;
};

export type Manifest = {
  doubloons: number;
  cargo: CargoItem[];
  relics: Relic[];
};

export type FactionStatus =
  | 'allied'
  | 'friendly'
  | 'neutral'
  | 'watched'
  | 'wanted'
  | 'kos';

export type Faction = {
  id: string;
  name: string;
  status: FactionStatus;
  note: string;
};

export type LogEntry = {
  id: string;
  session: number;
  date: string; // ISO date (YYYY-MM-DD), no time
  title: string;
  body: string;
  author: string;
};

export type BountyStatus = 'active' | 'paid' | 'cleared';

export type Bounty = {
  id: string;
  target: string;
  amount: number;
  issuer: string;
  reason: string;
  status: BountyStatus;
};

export type CrewData = {
  schemaVersion: typeof SCHEMA_VERSION;
  ship: Ship;
  characters: Character[];
  deceased: Character[];
  manifest: Manifest;
  factions: Faction[];
  log: LogEntry[];
  bounties: Bounty[];
  bountiesResolved: Bounty[];
};

export type PresenceEntry = {
  clientId: string;
  displayName: string;
};

export type CrewRow = {
  code: string;
  name: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
};

// ----------------------------------------------------------------------------
// Mutation vocabulary (§9.3).
// Every state change the client can request flows through one of these.
// Adding a feature that doesn't fit existing kinds means adding a new kind
// here — do not overload ship.set or character.update with unrelated concerns.
// ----------------------------------------------------------------------------

/**
 * Every `create` / `add` action carries its `id` in the payload. The client
 * assigns a fresh UUID when dispatching optimistically, and the server uses
 * the same id when applying. Without this, client and server would diverge
 * on every new item — identical state shape, different ids — and the next
 * update/remove against that item would fail with `unknown_*` on one side.
 */

export type Action =
  // Ship
  | { kind: 'ship.set'; field: keyof Ship; value: unknown }
  | { kind: 'ship.addUpgrade'; text: string }
  | { kind: 'ship.removeUpgrade'; index: number }
  | { kind: 'ship.addShanty'; text: string }
  | { kind: 'ship.removeShanty'; index: number }

  // Characters
  | { kind: 'character.create'; id: string }
  | { kind: 'character.update'; id: string; fields: Partial<Character> }
  | { kind: 'character.die'; id: string }
  | { kind: 'character.revive'; id: string }
  | { kind: 'character.remove'; id: string }

  // Manifest
  | { kind: 'doubloons.set'; value: number }
  | { kind: 'doubloons.adjust'; delta: number }
  | { kind: 'cargo.add'; id: string; item: Omit<CargoItem, 'id'> }
  | { kind: 'cargo.update'; id: string; fields: Partial<CargoItem> }
  | { kind: 'cargo.remove'; id: string }
  | { kind: 'relic.add'; id: string; relic: Omit<Relic, 'id'> }
  | { kind: 'relic.update'; id: string; fields: Partial<Relic> }
  | { kind: 'relic.remove'; id: string }

  // Factions
  | { kind: 'faction.add'; id: string; name: string }
  | { kind: 'faction.update'; id: string; fields: Partial<Faction> }
  | { kind: 'faction.remove'; id: string }

  // Log
  | { kind: 'log.add'; id: string; entry: Omit<LogEntry, 'id'> }
  | { kind: 'log.update'; id: string; fields: Partial<LogEntry> }
  | { kind: 'log.remove'; id: string }

  // Bounties
  | { kind: 'bounty.add'; id: string; bounty: Omit<Bounty, 'id'> }
  | { kind: 'bounty.update'; id: string; fields: Partial<Bounty> }
  | { kind: 'bounty.resolve'; id: string; status: 'paid' | 'cleared' }
  | { kind: 'bounty.remove'; id: string };

export type ApplyResult =
  | { ok: true; state: CrewData }
  | { ok: false; reason: string };
