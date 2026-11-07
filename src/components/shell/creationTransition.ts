import { captureOrbRect } from '../../ui/motion';

/**
 * Captures the Quick Add + orb geometry before state update so ModalSheet
 * morphs between the orb's rect/radius and the sheet's rect/radius with springs.sheet.
 */
export function transitionCreation(update: () => void): void {
  captureOrbRect();
  update();
}
