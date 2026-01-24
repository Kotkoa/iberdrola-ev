import './App.css';

import { useState, lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import { PrimaryStationProvider } from './context/PrimaryStationContext';
import { AppLayout } from './components/layout/AppLayout';
import { TabNavigation } from './components/layout/TabNavigation';
import { StationTab } from './components/station/StationTab';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import Copyright from './components/Copyright';
import type { TabName } from './types';

const SearchTab = lazy(() =>
  import('./components/search/SearchTab').then((module) => ({ default: module.SearchTab }))
);

function App() {
  const [activeTab, setActiveTab] = useState<TabName>('station');

  const handleNavigateToSearch = () => {
    setActiveTab('search');
  };

  const handleStationSelected = () => {
    setActiveTab('station');
  };

  return (
    <PrimaryStationProvider>
      <AppLayout>
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        <Box sx={{ flex: 1, width: '100%', minHeight: 0, overflow: 'hidden' }}>
          {activeTab === 'station' ? (
            <StationTab onNavigateToSearch={handleNavigateToSearch} />
          ) : (
            <Suspense fallback={<LoadingSkeleton />}>
              <SearchTab onStationSelected={handleStationSelected} />
            </Suspense>
          )}
        </Box>

        <Copyright />
      </AppLayout>
    </PrimaryStationProvider>
  );
}

export default App;
