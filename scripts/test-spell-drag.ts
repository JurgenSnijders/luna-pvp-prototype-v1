import {
  hitTestSlotDropZones,
  HUD_DROP_PRIORITY,
  LOADOUT_DROP_PRIORITY,
  type SlotDropZoneRect,
} from '../src/game/spellDragDrop';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`${GREEN}✓${RESET} ${message}`);
  } else {
    failed++;
    console.error(`${RED}✗${RESET} ${message}`);
  }
}

const loadoutZone: SlotDropZoneRect = {
  slotKey: 'Q',
  left: 100,
  top: 200,
  right: 164,
  bottom: 264,
  priority: LOADOUT_DROP_PRIORITY,
};

const hudZone: SlotDropZoneRect = {
  slotKey: 'E',
  left: 110,
  top: 210,
  right: 174,
  bottom: 274,
  priority: HUD_DROP_PRIORITY,
};

assert(
  hitTestSlotDropZones(130, 230, [loadoutZone]) === 'Q',
  'pointer on loadout rect returns that slot',
);

assert(
  hitTestSlotDropZones(130, 230, [loadoutZone, hudZone]) === 'E',
  'overlapping HUD rect wins when both zones are registered',
);

assert(
  hitTestSlotDropZones(130, 230, [loadoutZone]) === 'Q',
  'loadout wins when suppressed HUD rect is excluded from the set',
);

assert(
  hitTestSlotDropZones(0, 0, [loadoutZone, hudZone]) === null,
  'pointer outside all rects returns null',
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
