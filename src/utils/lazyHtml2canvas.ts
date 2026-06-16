// Lazy-load html2canvas (~400KB) only when needed
let cachedModule: typeof import('html2canvas') | null = null;

export const lazyHtml2canvas = async (
  element: HTMLElement,
  options?: Parameters<typeof import('html2canvas').default>[1]
) => {
  if (!cachedModule) {
    cachedModule = await import('html2canvas');
  }
  return cachedModule.default(element, options);
};
