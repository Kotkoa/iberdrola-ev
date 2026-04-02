import './App.css';

import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import { PrimaryStationProvider } from './context/PrimaryStationContext';
import { AppLayout } from './components/layout/AppLayout';
import { TabNavigation } from './components/layout/TabNavigation';
import { StationTab } from './components/station/StationTab';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import Copyright from './components/Copyright';
import { trackPageView } from './analytics';
import type { TabName } from './types';

const SearchTab = lazy(() =>
  import('./components/search/SearchTab').then((module) => ({ default: module.SearchTab }))
);

function App() {
  const [activeTab, setActiveTab] = useState<TabName>('station');
  const [searchTabMounted, setSearchTabMounted] = useState(false);

  const handleTabChange = useCallback((tab: TabName) => {
    setActiveTab(tab);
    if (tab === 'search') setSearchTabMounted(true);
    trackPageView(tab);
  }, []);

  useEffect(() => {
    trackPageView('station');
  }, []);

  const handleNavigateToSearch = useCallback(() => {
    handleTabChange('search');
  }, [handleTabChange]);

  const handleStationSelected = useCallback(() => {
    handleTabChange('station');
  }, [handleTabChange]);

  return (
    <PrimaryStationProvider>
      <AppLayout>
        <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            width: '100%',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              display: activeTab === 'station' ? 'flex' : 'none',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            <StationTab onNavigateToSearch={handleNavigateToSearch} />
          </Box>
          {searchTabMounted && (
            <Box
              sx={{
                display: activeTab === 'search' ? 'flex' : 'none',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
              }}
            >
              <Suspense fallback={<LoadingSkeleton />}>
                <SearchTab onStationSelected={handleStationSelected} />
              </Suspense>
            </Box>
          )}
        </Box>

        <Copyright />
      </AppLayout>
    </PrimaryStationProvider>
  );
}

export default App;
