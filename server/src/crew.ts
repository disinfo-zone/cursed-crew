import { uuid } from './ids.js';
import {
  SCHEMA_VERSION,
  type CrewData,
  type Faction,
  type Ship
} from './types.js';

const DEFAULT_SHIP: Ship = {
  name: '',
  class: 'Sloop',
  hp: 8,
  maxHp: 8,
  hullTier: 'light',
  speed: 3,
  agility: 2,
  skill: 0,
  broadsides: 4,
  smallArms: 2,
  ram: 4,
  crewCount: 1,
  minCrew: 1,
  maxCrew: 6,
  cargoMax: 4,
  upgrades: [],
  shanties: [],
  notes: ''
};

const DEFAULT_FACTIONS: Array<Omit<Faction, 'id'>> = [
  { name: 'British Crown', status: 'neutral', note: '' },
  { name: 'Spanish Crown', status: 'neutral', note: '' },
  { name: 'French Crown', status: 'neutral', note: '' },
  { name: 'Dutch Republic', status: 'neutral', note: '' },
  { name: 'Pirate Nation', status: 'neutral', note: '' },
  { name: 'Indigenous Peoples', status: 'neutral', note: '' }
];

/**
 * Build the starting CrewData for a freshly-created crew.
 *
 * Intentionally opinionated defaults — the Sloop at 8/8, one empty character
 * card, six factions at Neutral. Matches §5.4 of the design doc.
 */
export function defaultCrewData(shipName?: string): CrewData {
  return {
    schemaVersion: SCHEMA_VERSION,
    ship: { ...DEFAULT_SHIP, name: shipName ?? '' },
    characters: [
      {
        id: uuid(),
        name: '',
        class: 'Rapscallion',
        level: 0,
        hp: 4,
        maxHp: 4,
        agility: 0,
        presence: 0,
        strength: 0,
        toughness: 0,
        spirit: 0,
        silver: 0,
        devilsLuck: 0,
        conditions: [],
        featureNotes: '',
        inventory: []
      }
    ],
    deceased: [],
    manifest: {
      doubloons: 0,
      cargo: [],
      relics: []
    },
    factions: DEFAULT_FACTIONS.map((f) => ({ ...f, id: uuid() })),
    log: [],
    bounties: [],
    bountiesResolved: []
  };
}
