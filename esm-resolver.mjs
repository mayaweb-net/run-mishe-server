const extensionPattern = /\.(m?js|cjs|json|node|wasm)$/i;

const hasExtension = (specifier) => extensionPattern.test(specifier);

export async function resolve(specifier, context, nextResolve) {
  const isRelative =
    specifier.startsWith('./') || specifier.startsWith('../');

  if (isRelative && !hasExtension(specifier)) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND') {
        return nextResolve(`${specifier}/index.js`, context);
      }

      throw error;
    }
  }

  return nextResolve(specifier, context);
}
