import { TANK_STYLES } from '../twin/tankVariants/index.js';
import { useTankStyle } from '../twin/useTankStyle.js';

/** The dashboard's original gauge, plus every tank style the digital twin offers. */
export const DASHBOARD_TANK_STYLES = [{ id: 'classic', name: 'Classic' }, ...TANK_STYLES];

/** The viewer's dashboard tank style, saved in this browser (separate from the twin's choice). */
export const useDashboardTankStyle = () =>
  useTankStyle('swampds_dashboard_tank_style', DASHBOARD_TANK_STYLES, 'classic');
