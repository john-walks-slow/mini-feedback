declare global {
  interface Window {
    snapdom?: (
      element: Element,
      options?: Record<string, unknown>,
    ) => Promise<{ toCanvas: () => Promise<HTMLCanvasElement> }>;
  }
}

let loading: Promise<void> | null = null;

function loadSnapdom(endpoint: string): Promise<void> {
  if (window.snapdom) return Promise.resolve();

  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${endpoint}/snapdom.js`;
      script.async = true;
      script.onload = () => {
        if (window.snapdom) resolve();
        else reject(new Error('截图组件不可用'));
      };
      script.onerror = () => reject(new Error('截图组件加载失败'));
      document.head.appendChild(script);
    });
  }

  return loading;
}

function trimToContent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const contentHeight = Math.min(
    window.innerHeight,
    Math.max(320, document.body.getBoundingClientRect().height || window.innerHeight),
  );
  const scale = canvas.width / window.innerWidth;
  const height = Math.min(canvas.height, Math.round(contentHeight * scale));

  if (height >= canvas.height - 2) return canvas;

  const trimmed = document.createElement('canvas');
  trimmed.width = canvas.width;
  trimmed.height = height;
  trimmed.getContext('2d')?.drawImage(canvas, 0, 0, canvas.width, height, 0, 0, canvas.width, height);
  return trimmed;
}

function downscale(canvas: HTMLCanvasElement): string {
  const maxEdge = 1600;
  const ratio = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));

  if (ratio === 1) return canvas.toDataURL('image/jpeg', 0.82);

  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(canvas.width * ratio));
  output.height = Math.max(1, Math.round(canvas.height * ratio));

  const context = output.getContext('2d');
  if (!context) return canvas.toDataURL('image/jpeg', 0.82);

  context.drawImage(canvas, 0, 0, output.width, output.height);
  return output.toDataURL('image/jpeg', 0.82);
}

export async function captureScreenshot(
  endpoint: string,
  hide: () => void,
  restore: () => void,
): Promise<{ dataUrl: string | null; error: string | null }> {
  try {
    hide();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    await loadSnapdom(endpoint);
    const snapdom = window.snapdom!;
    const bodyBackground = getComputedStyle(document.body).backgroundColor;
    const backgroundColor =
      bodyBackground && bodyBackground !== 'rgba(0, 0, 0, 0)' ? bodyBackground : '#ffffff';

    const result = await snapdom(document.documentElement, {
      clip: 'viewport',
      backgroundColor,
    });

    const canvas = await result.toCanvas();
    return { dataUrl: downscale(trimToContent(canvas)), error: null };
  } catch (error) {
    return { dataUrl: null, error: (error as Error).message || 'capture failed' };
  } finally {
    restore();
  }
}
