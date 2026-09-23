export function hasConcreteHardwareToken(text: string): boolean {
  return (
    /\bi[3579]\s*-?\s*\d{3,5}[a-z]*\b/i.test(text) ||
    /\bryzen\s*\d\s*\d{4}[a-z]*\b/i.test(text) ||
    /\bfx[-\s]?\d{4}\b/i.test(text) ||
    /\bphenom(?:\s+ii)?(?:\s+x\d)?\s*\d{3,4}\b/i.test(text) ||
    /\bcore\s*2\s+(?:duo|quad|extreme)\s*[qe]\d{4}\b/i.test(text) ||
    /\b(?:pentium|celeron|xeon)\s+[a-z]?\d{3,5}[a-z]*\b/i.test(text) ||
    /\b(?:geforce|radeon|rtx|gtx|gts|gt)\s*\d{3,4}\b/i.test(text) ||
    /\b(?:radeon\s+)?(?:rx|hd|r[79])\s*\d{3,4}\b/i.test(text) ||
    /\barc\s+a\d{3,4}\b/i.test(text) ||
    /\bintel\s+hd\s+graphics\s+\d{3,4}\b/i.test(text) ||
    /\bati\s+x\d{3,4}\b/i.test(text)
  );
}

/** True when the text has no concrete model and is only a class/freq/API hint. */
export function isGenericRequirementText(text: string): boolean {
  if (hasConcreteHardwareToken(text)) {
    return false;
  }

  const normalized = text.toLowerCase();
  return (
    normalized.includes('directx') ||
    normalized.includes('shader model') ||
    normalized.includes('dedicated memory') ||
    normalized.includes('dedicated video card') ||
    normalized.includes('video card must') ||
    normalized.includes('compatible graphics') ||
    normalized.includes('compatible video') ||
    normalized.includes('dual core') ||
    normalized.includes('quad core') ||
    normalized.includes('quad-core') ||
    normalized.includes('ghz') ||
    (/\b\d+\s*gb\b/.test(normalized) &&
      (normalized.includes('vram') || normalized.includes('video'))) ||
    normalized === 'tbd'
  );
}
