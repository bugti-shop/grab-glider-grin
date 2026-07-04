import { beforeEach, describe, expect, it, vi } from 'vitest';

const driveMock = vi.fn();
const destroyMock = vi.fn();
const driverMock = vi.fn((config: any) => ({
  drive: () => driveMock(config),
  destroy: destroyMock,
}));

vi.mock('driver.js', () => ({
  driver: driverMock,
}));

vi.mock('@/features/tours/TourStateStore', () => ({
  hasSeenTour: vi.fn(async () => false),
  isDismissedForever: vi.fn(async () => false),
  markTourSeen: vi.fn(async () => undefined),
}));

describe('TourManager delayed tutorial targets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    driverMock.mockClear();
    driveMock.mockClear();
    destroyMock.mockClear();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/notesdashboard');
  });

  it('waits beyond the old short timeout for slow notebook targets', async () => {
    const { TourManager } = await import('@/features/tours/TourManager');
    TourManager.setNavigate((path) => {
      window.history.replaceState({}, '', path);
      window.setTimeout(() => {
        const button = document.createElement('button');
        button.dataset.tour = 'add-notebook';
        document.body.appendChild(button);
      }, 2_000);
    });

    const start = TourManager.startTour('notes-create-notebook', { force: true });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(driveMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await start;

    expect(window.location.pathname).toBe('/notebooks');
    expect(driveMock).toHaveBeenCalledTimes(1);
    expect(driverMock.mock.calls[0][0].steps[0].element).toBe('[data-tour="add-notebook"]');
  });

  it('does not mark a missing delayed target as seen', async () => {
    const stateStore = await import('@/features/tours/TourStateStore');
    const { TourManager } = await import('@/features/tours/TourManager');
    TourManager.setNavigate((path) => window.history.replaceState({}, '', path));

    const start = TourManager.startTour('personalize-app-lock', { force: true });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await start;

    expect(driveMock).not.toHaveBeenCalled();
    expect(stateStore.markTourSeen).not.toHaveBeenCalledWith('personalize-app-lock');
  });
});