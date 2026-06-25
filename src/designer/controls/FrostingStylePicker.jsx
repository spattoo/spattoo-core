import ChipPicker from './ChipPicker.jsx';

// Per-tier frosting STYLE (surface technique) picker — a chip row over the cream styles allowed for
// the tier's current frosting type (Smooth | Cream Wave | Swirl | Rustic). Geometry only; the tier's
// material comes from its type and its colour from the ColorWheel. `value` = current style,
// `options` = [{ value, label }] (already filtered by what the type permits), `onChange(style)`.
export default function FrostingStylePicker({ value, options, onChange }) {
  return <ChipPicker label="Style" options={options} value={value} onChange={onChange} />;
}
