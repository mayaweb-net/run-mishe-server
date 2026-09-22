# کاتالوگ بازی Run Mishe

منبع انسانی برای `seed/games/game-allowlist.ts` است.
Seeder فقط همین لیست را نگه می‌دارد و بقیه را از دیتابیس حذف می‌کند.

بازسازی seed از Steam:

```bash
python scripts/rebuild_game_seed_from_allowlist.py
pnpm exec tsx --tsconfig tsconfig.json src/app/db/prisma/seed/games/run-games-seed.ts
```

یادداشت‌ها:

- ردیف‌های تکراری در جدول زیر (BG3، Hogwarts، Lies of P، RE4 Remake) در allowlist یکتا شده‌اند.
- غیر-Steam فعلاً stub بدون requirement: Valorant، Fortnite، Diablo IV، WoW، Minecraft، Alan Wake 2.
- مرجع بعدی برای بنچمارک/FPS: notebookcheck

| # | Game | Genre |
| --- | --- | --- |
| 1 | Cyberpunk 2077 | RPG / Open World |
| 2 | Red Dead Redemption 2 | Action / Open World |
| 3 | Grand Theft Auto V | Action / Open World |
| 4 | Elden Ring | Action RPG |
| 5 | Baldur's Gate 3 | RPG |
| 6 | The Witcher 3: Wild Hunt | RPG |
| 7 | Hogwarts Legacy | RPG / Open World |
| 8 | Black Myth: Wukong | Action RPG |
| 9 | Kingdom Come: Deliverance II | RPG |
| 10 | Starfield | RPG / Open World |
| 11 | Assassin's Creed Shadows | Action RPG |
| 12 | Assassin's Creed Valhalla | Action RPG |
| 13 | Assassin's Creed Odyssey | Action RPG |
| 14 | God of War | Action |
| 15 | God of War Ragnarök | Action |
| 16 | Marvel's Spider-Man Remastered | Action |
| 17 | Marvel's Spider-Man 2 | Action |
| 18 | Horizon Zero Dawn Remastered | Action RPG |
| 19 | Horizon Forbidden West | Action RPG |
| 20 | Ghost of Tsushima Director's Cut | Action |
| 21 | The Last of Us Part I | Action |
| 22 | The Last of Us Part II Remastered | Action |
| 23 | Uncharted: Legacy of Thieves Collection | Action |
| 24 | Days Gone | Action |
| 25 | Death Stranding Director's Cut | Action |
| 26 | Monster Hunter: World | Action RPG |
| 27 | Monster Hunter Wilds | Action RPG |
| 28 | Dragon's Dogma 2 | Action RPG |
| 29 | Final Fantasy VII Rebirth | RPG |
| 30 | Final Fantasy XVI | RPG |
| 31 | Resident Evil 4 | Survival Horror |
| 32 | Resident Evil Village | Survival Horror |
| 33 | Resident Evil 2 | Survival Horror |
| 34 | Alan Wake 2 | Survival Horror |
| 35 | Silent Hill 2 | Survival Horror |
| 36 | Dead Space | Survival Horror |
| 37 | Doom Eternal | FPS |
| 38 | DOOM: The Dark Ages | FPS |
| 39 | Metro Exodus Enhanced Edition | FPS |
| 40 | S.T.A.L.K.E.R. 2: Heart of Chornobyl | FPS / RPG |
| 41 | Battlefield 2042 | FPS |
| 42 | Battlefield V | FPS |
| 43 | Call of Duty: Black Ops 6 | FPS |
| 44 | Call of Duty: Modern Warfare III | FPS |
| 45 | Call of Duty: Warzone | FPS |
| 46 | Counter-Strike 2 | Competitive FPS |
| 47 | Valorant | Competitive FPS |
| 48 | Apex Legends | Battle Royale / FPS |
| 49 | Fortnite | Battle Royale |
| 50 | Overwatch 2 | FPS |
| 51 | Rainbow Six Siege | Tactical FPS |
| 52 | PUBG: Battlegrounds | Battle Royale |
| 53 | Escape from Tarkov | FPS / Survival |
| 54 | Helldivers 2 | Co-op Shooter |
| 55 | Warhammer 40,000: Space Marine 2 | Action |
| 56 | Diablo IV | Action RPG |
| 57 | Path of Exile 2 | Action RPG |
| 58 | Black Desert | MMORPG |
| 59 | World of Warcraft | MMORPG |
| 60 | Final Fantasy XIV | MMORPG |
| 61 | Minecraft | Sandbox |
| 62 | Terraria | Sandbox |
| 63 | Valheim | Survival |
| 64 | Rust | Survival |
| 65 | ARK: Survival Ascended | Survival |
| 66 | Sons of the Forest | Survival |
| 67 | Subnautica | Survival |
| 68 | Palworld | Survival |
| 69 | Enshrouded | Survival |
| 70 | No Man's Sky | Survival / Exploration |
| 71 | Red Dead Redemption | Action |
| 72 | GTA IV | Action |
| 73 | GTA Trilogy Definitive Edition | Action |
| 74 | Sekiro: Shadows Die Twice | Action RPG |
| 75 | Dark Souls III | Action RPG |
| 76 | Dark Souls Remastered | Action RPG |
| 77 | Lies of P | Action RPG |
| 78 | Black Mesa | FPS |
| 79 | Half-Life 2 | FPS |
| 80 | Portal 2 | Puzzle |
| 81 | The Elder Scrolls V: Skyrim Special Edition | RPG |
| 82 | Fallout 4 | RPG |
| 83 | Fallout 76 | RPG / Online |
| 84 | Star Wars Jedi: Survivor | Action |
| 85 | Star Wars Jedi: Fallen Order | Action |
| 86 | A Plague Tale: Requiem | Action |
| 87 | Control Ultimate Edition | Action |
| 88 | Dying Light 2 | Action / RPG |
| 89 | Hades II | Roguelike |
| 90 | Hades | Roguelike |
| 91 | Hollow Knight | Metroidvania |
| 92 | Stardew Valley | Simulation |
| 93 | Disco Elysium | RPG |
| 94 | Civilization VII | Strategy |
| 95 | Total War: Warhammer III | Strategy |
| 96 | Microsoft Flight Simulator 2024 | Simulation |
