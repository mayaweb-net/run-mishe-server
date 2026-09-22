import type { NbcSettingSpec } from '../types';

/**
 * Target matrix for v1 NotebookCheck crawl.
 * settings_class_array: 1=Low, 2=Med, 3=High, 4=Ultra 1080, 6=QHD Ultra, 7=4K Ultra.
 */
export const NBC_TARGET_SETTINGS = [
  { settingsClass: 1, resolution: 'R1080P', preset: 'LOW' },
  { settingsClass: 2, resolution: 'R1080P', preset: 'MEDIUM' },
  { settingsClass: 3, resolution: 'R1080P', preset: 'HIGH' },
  { settingsClass: 4, resolution: 'R1080P', preset: 'ULTRA' },
  { settingsClass: 6, resolution: 'R1440P', preset: 'ULTRA' },
  { settingsClass: 7, resolution: 'R2160P', preset: 'ULTRA' },
] as const satisfies readonly NbcSettingSpec[];

export const NBC_SETTINGS_CLASS_QUERY = NBC_TARGET_SETTINGS.map(
  (row) => row.settingsClass,
);

export const NBC_DEFAULT_CONFIDENCE = 0.75;

export const NBC_DESKTOP_LIST_URL =
  'https://www.notebookcheck.net/Ranking-of-desktop-GPUs-in-demanding-PC-games.1082241.0.html';

export function settingForClass(
  settingsClass: number,
): NbcSettingSpec | undefined {
  return NBC_TARGET_SETTINGS.find((row) => row.settingsClass === settingsClass);
}
