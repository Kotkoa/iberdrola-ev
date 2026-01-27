import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

const RADIUS_OPTIONS = [3, 5, 10, 15, 25];

interface RadiusSelectorProps {
  value: number;
  onChange: (radius: number) => void;
  disabled?: boolean;
}

export function RadiusSelector({ value, onChange, disabled }: RadiusSelectorProps) {
  return (
    <FormControl size="small" sx={{ minWidth: 90 }}>
      <Select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        sx={{
          height: '40px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {RADIUS_OPTIONS.map((r) => (
          <MenuItem key={r} value={r}>
            {r} km
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
