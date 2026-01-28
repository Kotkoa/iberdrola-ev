import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PortsList } from './PortsList';
import type { PortNumber, SubscriptionStatus } from '../types';

// Mock only PortCard (since it's a separate component)
vi.mock('./PortCard', () => ({
  PortCard: ({ portNumber, isAvailable }: { portNumber: number; isAvailable: boolean }) => (
    <div data-testid={`port-card-${portNumber}`} data-available={isAvailable}>
      Port {portNumber}
    </div>
  ),
}));

describe('PortsList', () => {
  const defaultProps = {
    portConfigs: [
      {
        portNumber: 1 as PortNumber,
        isAvailable: true,
        busyDuration: null,
        powerKw: 22,
        priceKwh: 0,
        socketType: 'Type 2',
      },
      {
        portNumber: 2 as PortNumber,
        isAvailable: false,
        busyDuration: '2h 30m',
        powerKw: 22,
        priceKwh: 0,
        socketType: 'Type 2',
      },
    ],
    subscriptionState: { 1: 'idle', 2: 'idle' } as Record<PortNumber, SubscriptionStatus>,
    subscriptionErrors: { 1: null, 2: null } as Record<PortNumber, string | null>,
    pushAvailable: true,
    isStandalone: false,
    onSubscribeClick: vi.fn(),
  };

  it('should render port cards for each port', () => {
    render(<PortsList {...defaultProps} />);

    expect(screen.getByTestId('port-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('port-card-2')).toBeInTheDocument();
  });

  it('should show subscribe button ONLY for occupied ports when push is available', () => {
    render(<PortsList {...defaultProps} />);

    // Port 1 is available - no subscribe button
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1); // Only one button for port 2

    // The button should be "Get notified"
    expect(screen.getByText('Get notified')).toBeInTheDocument();
  });

  it('should disable subscribe button when push is not available', () => {
    render(<PortsList {...defaultProps} pushAvailable={false} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should show "Push notifications are not supported" when push not available', () => {
    render(<PortsList {...defaultProps} pushAvailable={false} />);

    expect(
      screen.getByText('Push notifications are not supported in this browser.')
    ).toBeInTheDocument();
  });

  it('should NOT show "Push not supported" message when push IS available', () => {
    render(<PortsList {...defaultProps} pushAvailable={true} />);

    expect(
      screen.queryByText('Push notifications are not supported in this browser.')
    ).not.toBeInTheDocument();
  });

  it('should call onSubscribeClick when button is clicked', () => {
    const onSubscribeClick = vi.fn();
    render(<PortsList {...defaultProps} onSubscribeClick={onSubscribeClick} />);

    fireEvent.click(screen.getByText('Get notified'));

    expect(onSubscribeClick).toHaveBeenCalledWith(2);
  });

  it('should show loading state during subscription', () => {
    render(<PortsList {...defaultProps} subscriptionState={{ 1: 'idle', 2: 'loading' }} />);

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Subscribing...');
    expect(button).toBeDisabled();
  });

  it('should show success state after subscription', () => {
    render(<PortsList {...defaultProps} subscriptionState={{ 1: 'idle', 2: 'success' }} />);

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Alert active');
    expect(button).toBeDisabled();
  });

  it('should show success alert when subscribed to one port', () => {
    render(<PortsList {...defaultProps} subscriptionState={{ 1: 'idle', 2: 'success' }} />);

    expect(
      screen.getByText("We'll alert you as soon as this port is available")
    ).toBeInTheDocument();
  });

  it('should show station alert when subscribed to both ports', () => {
    const bothOccupied = {
      ...defaultProps,
      portConfigs: [
        { ...defaultProps.portConfigs[0], isAvailable: false },
        { ...defaultProps.portConfigs[1], isAvailable: false },
      ],
      subscriptionState: { 1: 'success', 2: 'success' } as Record<PortNumber, SubscriptionStatus>,
    };

    render(<PortsList {...bothOccupied} />);

    expect(
      screen.getByText("We'll alert you as soon as this station is available")
    ).toBeInTheDocument();
  });

  it('should show error state with retry option', () => {
    render(
      <PortsList
        {...defaultProps}
        subscriptionState={{ 1: 'idle', 2: 'error' }}
        subscriptionErrors={{ 1: null, 2: 'Network error' }}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Try again');
    expect(button).not.toBeDisabled();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('should show promo text when port is occupied and no subscriptions yet', () => {
    render(<PortsList {...defaultProps} />);

    expect(
      screen.getByText("No waiting. No checking. Just come when it's free.")
    ).toBeInTheDocument();
  });

  it('should hide promo text when already subscribed', () => {
    render(<PortsList {...defaultProps} subscriptionState={{ 1: 'idle', 2: 'success' }} />);

    expect(
      screen.queryByText("No waiting. No checking. Just come when it's free.")
    ).not.toBeInTheDocument();
  });

  it('should hide promo text when all ports are available', () => {
    const allAvailable = {
      ...defaultProps,
      portConfigs: [
        { ...defaultProps.portConfigs[0], isAvailable: true },
        { ...defaultProps.portConfigs[1], isAvailable: true },
      ],
    };

    render(<PortsList {...allAvailable} />);

    expect(
      screen.queryByText("No waiting. No checking. Just come when it's free.")
    ).not.toBeInTheDocument();
  });
});
