/**
 * Curated catalog for Run Mishe — source: document/games.md
 * Deduped (Baldur's Gate 3, Hogwarts Legacy, Lies of P appeared twice).
 * `steamAppId` null = not distributed on Steam (manual catalog later).
 * `aliases` = Steam Store / seed name variants used for matching.
 */
export interface GameAllowlistEntry {
  name: string;
  genre: string;
  steamAppId: number | null;
  aliases?: readonly string[];
}

export const GAME_ALLOWLIST = [
  {
    name: 'Cyberpunk 2077',
    genre: 'RPG / Open World',
    steamAppId: 1091500,
  },
  {
    name: 'Red Dead Redemption 2',
    genre: 'Action / Open World',
    steamAppId: 1174180,
  },
  {
    name: 'Grand Theft Auto V',
    genre: 'Action / Open World',
    steamAppId: 271590,
    aliases: ['Grand Theft Auto V Legacy', 'Grand Theft Auto V Enhanced'],
  },
  {
    name: 'Elden Ring',
    genre: 'Action RPG',
    steamAppId: 1245620,
    aliases: ['ELDEN RING'],
  },
  {
    name: "Baldur's Gate 3",
    genre: 'RPG',
    steamAppId: 1086940,
  },
  {
    name: 'The Witcher 3: Wild Hunt',
    genre: 'RPG',
    steamAppId: 292030,
    aliases: ['The Witcher 3: Wild Hunt - Complete Edition'],
  },
  {
    name: 'Hogwarts Legacy',
    genre: 'RPG / Open World',
    steamAppId: 990080,
  },
  {
    name: 'Black Myth: Wukong',
    genre: 'Action RPG',
    steamAppId: 2358720,
  },
  {
    name: 'Kingdom Come: Deliverance II',
    genre: 'RPG',
    steamAppId: 1771300,
  },
  {
    name: 'Starfield',
    genre: 'RPG / Open World',
    steamAppId: 1716740,
  },
  {
    name: "Assassin's Creed Shadows",
    genre: 'Action RPG',
    steamAppId: 3159330,
  },
  {
    name: "Assassin's Creed Valhalla",
    genre: 'Action RPG',
    steamAppId: 2208920,
  },
  {
    name: "Assassin's Creed Odyssey",
    genre: 'Action RPG',
    steamAppId: 812140,
  },
  {
    name: 'God of War',
    genre: 'Action',
    steamAppId: 1593500,
  },
  {
    name: 'God of War Ragnarök',
    genre: 'Action',
    steamAppId: 2322010,
  },
  {
    name: "Marvel's Spider-Man Remastered",
    genre: 'Action',
    steamAppId: 1817070,
  },
  {
    name: "Marvel's Spider-Man 2",
    genre: 'Action',
    steamAppId: 2651280,
  },
  {
    name: 'Horizon Zero Dawn Remastered',
    genre: 'Action RPG',
    steamAppId: 2561580,
  },
  {
    name: 'Horizon Forbidden West',
    genre: 'Action RPG',
    steamAppId: 2420110,
    aliases: ['Horizon Forbidden West™ Complete Edition'],
  },
  {
    name: "Ghost of Tsushima Director's Cut",
    genre: 'Action',
    steamAppId: 2215430,
  },
  {
    name: 'The Last of Us Part I',
    genre: 'Action',
    steamAppId: 1888930,
  },
  {
    name: 'The Last of Us Part II Remastered',
    genre: 'Action',
    steamAppId: 2531310,
  },
  {
    name: 'Uncharted: Legacy of Thieves Collection',
    genre: 'Action',
    steamAppId: 1659420,
  },
  {
    name: 'Days Gone',
    genre: 'Action',
    steamAppId: 1259420,
  },
  {
    name: "Death Stranding Director's Cut",
    genre: 'Action',
    steamAppId: 1850570,
  },
  {
    name: 'Monster Hunter: World',
    genre: 'Action RPG',
    steamAppId: 582010,
  },
  {
    name: 'Monster Hunter Wilds',
    genre: 'Action RPG',
    steamAppId: 2246340,
  },
  {
    name: "Dragon's Dogma 2",
    genre: 'Action RPG',
    steamAppId: 2054970,
  },
  {
    name: 'Final Fantasy VII Rebirth',
    genre: 'RPG',
    steamAppId: 2909400,
  },
  {
    name: 'Final Fantasy XVI',
    genre: 'RPG',
    steamAppId: 2515020,
    aliases: ['FINAL FANTASY XVI'],
  },
  {
    name: 'Resident Evil 4',
    genre: 'Survival Horror',
    steamAppId: 2050650,
    aliases: ['Resident Evil 4 Remake'],
  },
  {
    name: 'Resident Evil Village',
    genre: 'Survival Horror',
    steamAppId: 1196590,
  },
  {
    name: 'Resident Evil 2',
    genre: 'Survival Horror',
    steamAppId: 883710,
    aliases: ['Resident Evil 2'],
  },
  {
    name: 'Alan Wake 2',
    genre: 'Survival Horror',
    steamAppId: null, // Epic / Game Pass; not reliably on Steam Store search
  },
  {
    name: 'Silent Hill 2',
    genre: 'Survival Horror',
    steamAppId: 2124490,
  },
  {
    name: 'Dead Space',
    genre: 'Survival Horror',
    steamAppId: 1693980,
  },
  {
    name: 'Doom Eternal',
    genre: 'FPS',
    steamAppId: 782330,
    aliases: ['DOOM Eternal'],
  },
  {
    name: 'DOOM: The Dark Ages',
    genre: 'FPS',
    steamAppId: 3017860,
  },
  {
    name: 'Metro Exodus Enhanced Edition',
    genre: 'FPS',
    steamAppId: 1449560,
  },
  {
    name: 'S.T.A.L.K.E.R. 2: Heart of Chornobyl',
    genre: 'FPS / RPG',
    steamAppId: 1643320,
  },
  {
    name: 'Battlefield 2042',
    genre: 'FPS',
    steamAppId: 1517290,
  },
  {
    name: 'Battlefield V',
    genre: 'FPS',
    steamAppId: 1238810,
  },
  {
    name: 'Call of Duty: Black Ops 6',
    genre: 'FPS',
    steamAppId: 4384550,
    aliases: ['Call of Duty®: Black Ops 6'],
  },
  {
    name: 'Call of Duty: Modern Warfare III',
    genre: 'FPS',
    steamAppId: 2519060,
    aliases: ['Call of Duty®: Modern Warfare® III'],
  },
  {
    name: 'Call of Duty: Warzone',
    genre: 'FPS',
    steamAppId: 1962663,
    aliases: ['Call of Duty®: Warzone™'],
  },
  {
    name: 'Counter-Strike 2',
    genre: 'Competitive FPS',
    steamAppId: 730,
  },
  {
    name: 'Valorant',
    genre: 'Competitive FPS',
    steamAppId: null,
  },
  {
    name: 'Apex Legends',
    genre: 'Battle Royale / FPS',
    steamAppId: 1172470,
    aliases: ['Apex Legends™'],
  },
  {
    name: 'Fortnite',
    genre: 'Battle Royale',
    steamAppId: null,
  },
  {
    name: 'Overwatch 2',
    genre: 'FPS',
    steamAppId: 2357570,
    aliases: ['Overwatch® 2', 'Overwatch®'],
  },
  {
    name: 'Rainbow Six Siege',
    genre: 'Tactical FPS',
    steamAppId: 359550,
    aliases: ["Tom Clancy's Rainbow Six Siege"],
  },
  {
    name: 'PUBG: Battlegrounds',
    genre: 'Battle Royale',
    steamAppId: 578080,
    aliases: ['PUBG: BATTLEGROUNDS'],
  },
  {
    name: 'Escape from Tarkov',
    genre: 'FPS / Survival',
    steamAppId: 3932890,
  },
  {
    name: 'Helldivers 2',
    genre: 'Co-op Shooter',
    steamAppId: 553850,
    aliases: ['HELLDIVERS™ 2'],
  },
  {
    name: 'Warhammer 40,000: Space Marine 2',
    genre: 'Action',
    steamAppId: 2183900,
  },
  {
    name: 'Diablo IV',
    genre: 'Action RPG',
    steamAppId: null,
  },
  {
    name: 'Path of Exile 2',
    genre: 'Action RPG',
    steamAppId: 2694490,
  },
  {
    name: 'Black Desert',
    genre: 'MMORPG',
    steamAppId: 582660,
  },
  {
    name: 'World of Warcraft',
    genre: 'MMORPG',
    steamAppId: null,
  },
  {
    name: 'Final Fantasy XIV',
    genre: 'MMORPG',
    steamAppId: 39210,
    aliases: ['FINAL FANTASY XIV Online'],
  },
  {
    name: 'Minecraft',
    genre: 'Sandbox',
    steamAppId: null,
  },
  {
    name: 'Terraria',
    genre: 'Sandbox',
    steamAppId: 105600,
  },
  {
    name: 'Valheim',
    genre: 'Survival',
    steamAppId: 892970,
  },
  {
    name: 'Rust',
    genre: 'Survival',
    steamAppId: 252490,
  },
  {
    name: 'ARK: Survival Ascended',
    genre: 'Survival',
    steamAppId: 2399830,
  },
  {
    name: 'Sons of the Forest',
    genre: 'Survival',
    steamAppId: 1326470,
  },
  {
    name: 'Subnautica',
    genre: 'Survival',
    steamAppId: 264710,
  },
  {
    name: 'Palworld',
    genre: 'Survival',
    steamAppId: 1623730,
  },
  {
    name: 'Enshrouded',
    genre: 'Survival',
    steamAppId: 1203620,
  },
  {
    name: "No Man's Sky",
    genre: 'Survival / Exploration',
    steamAppId: 275850,
  },
  {
    name: 'Red Dead Redemption',
    genre: 'Action',
    steamAppId: 2668510,
  },
  {
    name: 'GTA IV',
    genre: 'Action',
    steamAppId: 12210,
    aliases: ['Grand Theft Auto IV: The Complete Edition'],
  },
  {
    name: 'GTA Trilogy Definitive Edition',
    genre: 'Action',
    steamAppId: 1547000,
    aliases: [
      'Grand Theft Auto: The Trilogy – The Definitive Edition',
      'Grand Theft Auto: The Trilogy - The Definitive Edition',
      'Grand Theft Auto: San Andreas – The Definitive Edition',
      'Grand Theft Auto: San Andreas - The Definitive Edition',
    ],
  },
  {
    name: 'Sekiro: Shadows Die Twice',
    genre: 'Action RPG',
    steamAppId: 814380,
    aliases: ['Sekiro™: Shadows Die Twice - GOTY Edition'],
  },
  {
    name: 'Dark Souls III',
    genre: 'Action RPG',
    steamAppId: 374320,
    aliases: ['DARK SOULS™ III'],
  },
  {
    name: 'Dark Souls Remastered',
    genre: 'Action RPG',
    steamAppId: 570940,
    aliases: ['DARK SOULS™: REMASTERED'],
  },
  {
    name: 'Lies of P',
    genre: 'Action RPG',
    steamAppId: 1627720,
  },
  {
    name: 'Black Mesa',
    genre: 'FPS',
    steamAppId: 362890,
  },
  {
    name: 'Half-Life 2',
    genre: 'FPS',
    steamAppId: 220,
  },
  {
    name: 'Portal 2',
    genre: 'Puzzle',
    steamAppId: 620,
  },
  {
    name: 'The Elder Scrolls V: Skyrim Special Edition',
    genre: 'RPG',
    steamAppId: 489830,
  },
  {
    name: 'Fallout 4',
    genre: 'RPG',
    steamAppId: 377160,
  },
  {
    name: 'Fallout 76',
    genre: 'RPG / Online',
    steamAppId: 1151340,
  },
  {
    name: 'Star Wars Jedi: Survivor',
    genre: 'Action',
    steamAppId: 1774580,
    aliases: ['STAR WARS Jedi: Survivor™'],
  },
  {
    name: 'Star Wars Jedi: Fallen Order',
    genre: 'Action',
    steamAppId: 1172380,
    aliases: ['STAR WARS Jedi: Fallen Order™'],
  },
  {
    name: 'A Plague Tale: Requiem',
    genre: 'Action',
    steamAppId: 1182900,
  },
  {
    name: 'Control Ultimate Edition',
    genre: 'Action',
    steamAppId: 870780,
  },
  {
    name: 'Dying Light 2',
    genre: 'Action / RPG',
    steamAppId: 534380,
    aliases: ['Dying Light 2 Stay Human: Reloaded Edition'],
  },
  {
    name: 'Hades II',
    genre: 'Roguelike',
    steamAppId: 1145350,
  },
  {
    name: 'Hades',
    genre: 'Roguelike',
    steamAppId: 1145360,
  },
  {
    name: 'Hollow Knight',
    genre: 'Metroidvania',
    steamAppId: 367520,
  },
  {
    name: 'Stardew Valley',
    genre: 'Simulation',
    steamAppId: 413150,
  },
  {
    name: 'Disco Elysium',
    genre: 'RPG',
    steamAppId: 632470,
    aliases: ['Disco Elysium - The Final Cut'],
  },
  {
    name: 'Civilization VII',
    genre: 'Strategy',
    steamAppId: 1295660,
    aliases: ["Sid Meier's Civilization VII", "Sid Meier's Civilization® VII"],
  },
  {
    name: 'Total War: Warhammer III',
    genre: 'Strategy',
    steamAppId: 1142710,
    aliases: ['Total War: WARHAMMER III'],
  },
  {
    name: 'Microsoft Flight Simulator 2024',
    genre: 'Simulation',
    steamAppId: 2537590,
  },
] as const satisfies readonly GameAllowlistEntry[];

export const GAME_ALLOWLIST_STEAM_IDS: ReadonlySet<number> = new Set(
  GAME_ALLOWLIST.map((g) => g.steamAppId).filter(
    (id): id is number => id != null,
  ),
);
