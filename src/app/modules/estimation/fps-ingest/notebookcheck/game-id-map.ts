import { slugify } from '@/app/db/prisma/seed/hardware/shared';
import { GAME_ALLOWLIST } from '@/app/db/prisma/seed/games/game-allowlist';
import type { NbcGameMapEntry } from '../types';

/**
 * Static NotebookCheck `#bl_gameselect` hints keyed by allowlist slug.
 * Crawl still resolves ids from the live select (preferred); this map is a
 * fallback / documentation of known ids.
 */
const NBC_GAME_IDS_BY_SLUG: Record<string, number | null> = {
  'cyberpunk-2077': 990,
  'red-dead-redemption-2': 712,
  'grand-theft-auto-v': 329,
  'elden-ring': 899,
  'baldur-s-gate-3': 974,
  'the-witcher-3-wild-hunt': 941,
  'hogwarts-legacy': 948,
  'black-myth-wukong': 1047,
  'kingdom-come-deliverance-ii': null,
  starfield: 984,
  'assassin-s-creed-shadows': null,
  'assassin-s-creed-valhalla': 766,
  'assassin-s-creed-odyssey': 655,
  'god-of-war': 890,
  'god-of-war-ragnarok': null,
  'marvel-s-spider-man-remastered': 952,
  'marvel-s-spider-man-2': null,
  'horizon-zero-dawn-remastered': null,
  'horizon-forbidden-west': null,
  'ghost-of-tsushima-director-s-cut': null,
  'the-last-of-us-part-i': 960,
  'the-last-of-us-part-ii-remastered': null,
  'uncharted-legacy-of-thieves-collection': 917,
  'days-gone': 747,
  'death-stranding-director-s-cut': 896,
  'monster-hunter-world': 636,
  'monster-hunter-wilds': null,
  'dragon-s-dogma-2': null,
  'final-fantasy-vii-rebirth': null,
  'final-fantasy-xvi': null,
  'resident-evil-4': 970,
  'resident-evil-village': 832,
  'resident-evil-2': 640,
  'alan-wake-2': 991,
  'silent-hill-2': null,
  'dead-space': 942,
  'doom-eternal': 748,
  'doom-the-dark-ages': null,
  'metro-exodus-enhanced': 790,
  's-t-a-l-k-e-r-2-heart-of-chornobyl': null,
  'battlefield-2042': 870,
  'battlefield-v': 670,
  'call-of-duty-black-ops-6': null,
  'call-of-duty-modern-warfare-iii': null,
  'call-of-duty-warzone': 780,
  'counter-strike-2': 980,
  valorant: null,
  'apex-legends': 700,
  fortnite: null,
  'overwatch-2': 930,
  'rainbow-six-siege': 420,
  'pubg-battlegrounds': 550,
  'escape-from-tarkov': 720,
  'helldivers-2': null,
  'warhammer-40-000-space-marine-2': null,
  'diablo-iv': null,
  'path-of-exile-2': null,
  'black-desert': 500,
  'world-of-warcraft': null,
  'final-fantasy-xiv': 480,
  minecraft: null,
  terraria: null,
  valheim: 820,
  rust: 600,
  'ark-survival-ascended': 992,
  'sons-of-the-forest': 950,
  subnautica: 520,
  palworld: null,
  enshrouded: null,
  'no-man-s-sky': 530,
  'red-dead-redemption': null,
  'gta-iv': 44,
  'gta-trilogy-definitive': 880,
  'sekiro-shadows-die-twice': 690,
  'dark-souls-iii': 450,
  'dark-souls-remastered': 620,
  'lies-of-p': 978,
  'black-mesa': 760,
  'half-life-2': null,
  'portal-2': null,
  'the-elder-scrolls-v-skyrim-special': 510,
  'fallout-4': 470,
  'fallout-76': 660,
  'star-wars-jedi-survivor': 965,
  'star-wars-jedi-fallen-order': 730,
  'a-plague-tale-requiem': 935,
  'control-ultimate': 740,
  'dying-light-2': 885,
  'hades-ii': null,
  hades: 810,
  'hollow-knight': null,
  'stardew-valley': null,
  'disco-elysium': 770,
  'civilization-vii': null,
  'total-war-warhammer-iii': 900,
  'microsoft-flight-simulator-2024': null,
};

export function buildNbcGameMap(): NbcGameMapEntry[] {
  return GAME_ALLOWLIST.map((entry) => {
    const slug = slugify(entry.name);
    return {
      slug,
      name: entry.name,
      nbcGameId:
        slug in NBC_GAME_IDS_BY_SLUG ? NBC_GAME_IDS_BY_SLUG[slug]! : null,
    };
  });
}

export function mappedNbcGames(): NbcGameMapEntry[] {
  return buildNbcGameMap().filter((row) => row.nbcGameId != null);
}

export function unmappedNbcGames(): NbcGameMapEntry[] {
  return buildNbcGameMap().filter((row) => row.nbcGameId == null);
}

export function findNbcGameBySlug(slug: string): NbcGameMapEntry | undefined {
  return buildNbcGameMap().find((row) => row.slug === slug);
}
