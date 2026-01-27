import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStationSearch } from './useStationSearch';

describe('useStationSearch', () => {
  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useStationSearch());

    expect(result.current.stations).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.enriching).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toEqual({ current: 0, total: 0 });
  });

  it('should provide search and clear functions', () => {
    const { result } = renderHook(() => useStationSearch());

    expect(typeof result.current.search).toBe('function');
    expect(typeof result.current.clear).toBe('function');
  });

  it('should clear search results', () => {
    const { result } = renderHook(() => useStationSearch());

    result.current.clear();

    expect(result.current.stations).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toEqual({ current: 0, total: 0 });
  });
});
