/**
 * Pure "does it run?" verdict logic — document/roadmap.md § ران میشه؟
 */

export type RunCheckVerdict =
  | 'BELOW_MINIMUM'
  | 'MEETS_MINIMUM'
  | 'ABOVE_RECOMMENDED';

export type ComponentStatus = 'pass' | 'fail' | 'warn' | 'unknown';

export interface IndexRequirement {
  userIndex: number | null;
  requiredIndex: number | null;
}

export interface ValueRequirement {
  userValue: number | null;
  required: number | null;
}

export function compareIndex(input: IndexRequirement): ComponentStatus {
  if (input.requiredIndex == null) return 'unknown';
  if (input.userIndex == null) return 'unknown';
  return input.userIndex + 1e-9 >= input.requiredIndex ? 'pass' : 'fail';
}

export function compareRam(input: ValueRequirement): ComponentStatus {
  if (input.required == null) return 'unknown';
  if (input.userValue == null) return 'unknown';
  return input.userValue >= input.required ? 'pass' : 'fail';
}

/** Soft: below need → warn (may still run with stutter); unknown if no data. */
export function compareVram(input: ValueRequirement): ComponentStatus {
  if (input.required == null) return 'unknown';
  if (input.userValue == null) return 'unknown';
  if (input.userValue >= input.required) return 'pass';
  if (input.userValue >= input.required * 0.75) return 'warn';
  return 'fail';
}

export function tierPasses(components: {
  cpu: ComponentStatus;
  gpu: ComponentStatus;
  ram: ComponentStatus;
}): boolean {
  const hard = [components.cpu, components.gpu, components.ram];
  if (hard.some((status) => status === 'fail')) return false;
  // unknown does not block — missing Steam match shouldn't fail the whole check
  return true;
}

export function resolveVerdict(input: {
  minimumPass: boolean;
  recommendedPass: boolean;
}): RunCheckVerdict {
  if (!input.minimumPass) return 'BELOW_MINIMUM';
  if (!input.recommendedPass) return 'MEETS_MINIMUM';
  return 'ABOVE_RECOMMENDED';
}

export function verdictStatusLabelFa(verdict: RunCheckVerdict): string {
  switch (verdict) {
    case 'ABOVE_RECOMMENDED':
      return 'ران میشه';
    case 'MEETS_MINIMUM':
      return 'ران میشه (حداقلی)';
    case 'BELOW_MINIMUM':
      return 'ران نمیشه';
  }
}

export function performanceCopy(input: {
  verdict: RunCheckVerdict;
  fps1080High: number | null;
}): { summary: string; detail: string } {
  const fps = input.fps1080High;
  const fpsText =
    fps != null && fps > 0
      ? `حدود ${Math.round(fps)} فریم در ۱۰۸۰p روی کیفیت High`
      : null;

  switch (input.verdict) {
    case 'ABOVE_RECOMMENDED':
      return {
        summary: 'روی کیفیت High و Ultra راحت اجرا میشه',
        detail:
          fpsText ??
          'سیستمت از پیشنهادی بازی بالاتر است؛ برای جزئیات فریم به محاسبه‌گر FPS سر بزن.',
      };
    case 'MEETS_MINIMUM':
      return {
        summary: 'اجرا میشه، ولی بهتره تنظیمات رو پایین بیاری',
        detail:
          fpsText ??
          'حداقل سیستم را پوشش می‌دهد؛ برای تجربهٔ روان‌تر ارتقای GPU/CPU یا کاهش کیفیت را در نظر بگیر.',
      };
    case 'BELOW_MINIMUM':
      return {
        summary: 'با این سخت‌افزار اجرای قابل‌قبولی بعید است',
        detail:
          'حداقل یکی از قطعات (CPU/GPU/RAM) زیر حداقل سیستم بازی است. ارتقا لازم است.',
      };
  }
}
