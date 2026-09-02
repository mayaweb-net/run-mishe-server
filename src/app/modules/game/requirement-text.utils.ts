export function isGenericRequirementText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('directx') ||
    normalized.includes('shader model') ||
    normalized.includes('dedicated memory') ||
    normalized.includes('video card must') ||
    normalized.includes('compatible graphics') ||
    normalized.includes('dual core') ||
    normalized.includes('quad core') ||
    normalized.includes('quad-core') ||
    normalized.includes('ghz') ||
    normalized === 'tbd'
  );
}
