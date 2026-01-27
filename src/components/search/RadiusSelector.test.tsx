import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadiusSelector } from './RadiusSelector';

describe('RadiusSelector', () => {
  it('should render all radius options', () => {
    render(<RadiusSelector value={10} onChange={() => {}} />);

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    // Should have exactly these options: 3, 5, 10, 15, 25 km
    expect(screen.getByRole('option', { name: '3 km' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '5 km' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '10 km' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '15 km' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '25 km' })).toBeInTheDocument();
  });

  it('should have maximum radius of 25 km (rate limit protection)', () => {
    render(<RadiusSelector value={25} onChange={() => {}} />);

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    // 40 km should NOT be available (removed to prevent rate limiting)
    expect(screen.queryByRole('option', { name: '40 km' })).not.toBeInTheDocument();

    // 25 km should be the maximum option
    const options = screen.getAllByRole('option');
    const lastOption = options[options.length - 1];
    expect(lastOption).toHaveTextContent('25 km');
  });

  it('should call onChange with selected radius', () => {
    const handleChange = vi.fn();
    render(<RadiusSelector value={10} onChange={handleChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    const option15 = screen.getByRole('option', { name: '15 km' });
    fireEvent.click(option15);

    expect(handleChange).toHaveBeenCalledWith(15);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<RadiusSelector value={10} onChange={() => {}} disabled />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('aria-disabled', 'true');
  });

  it('should display current value', () => {
    render(<RadiusSelector value={15} onChange={() => {}} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveTextContent('15 km');
  });
});
