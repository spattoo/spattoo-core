import { FROSTING_TYPES } from '../hooks/useCakeDesign';
import ChipPicker from './ChipPicker.jsx';

// Per-tier frosting TYPE (material) picker — a chip row over FROSTING_TYPES
// (buttercream | whipped | fondant | naked). Type only; the tier's colour is handled
// by the shared ColorWheel. `value` = the tier's current frostingType, `onChange(type)`.
export default function FrostingTypePicker({ value, onChange }) {
  return <ChipPicker label="Frosting" options={FROSTING_TYPES} value={value} onChange={onChange} />;
}
