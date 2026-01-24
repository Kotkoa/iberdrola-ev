import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import type { TabName } from '../../types';

interface TabNavigationProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const handleChange = (_: React.SyntheticEvent, newValue: TabName) => {
    onTabChange(newValue);
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
      <Tabs
        value={activeTab}
        onChange={handleChange}
        variant="fullWidth"
        aria-label="navigation tabs"
        sx={{
          '& .MuiTab-root': {
            '&:focus': {
              outline: 'none',
            },
            '&.Mui-focusVisible': {
              backgroundColor: 'transparent',
            },
          },
        }}
      >
        <Tab label="Station" value="station" />
        <Tab label="Search" value="search" />
      </Tabs>
    </Box>
  );
}
