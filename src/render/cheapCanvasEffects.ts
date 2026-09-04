import { isCheapUi } from '../devtools/graphicsSettings';

export function useCheapCanvasEffects(): boolean {
  return isCheapUi();
}
