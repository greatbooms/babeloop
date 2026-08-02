export type VideoScene = { seconds: number; visual: string; dialogue: string; caption: string };

export function parseScenes(value: string | null | undefined): VideoScene[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (scene): scene is VideoScene =>
        typeof scene === 'object' &&
        scene !== null &&
        typeof (scene as VideoScene).seconds === 'number' &&
        typeof (scene as VideoScene).visual === 'string' &&
        typeof (scene as VideoScene).dialogue === 'string' &&
        typeof (scene as VideoScene).caption === 'string',
    );
  } catch {
    return [];
  }
}
