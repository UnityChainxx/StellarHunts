import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeAchievementUnlock,
  useAchievementUnlock,
} from './useAchievementUnlock';
import type { AchievementSocket } from '../types/achievement-unlock';

/** Minimal socket.io-like fake that records listeners and emits manually. */
class FakeSocket implements AchievementSocket {
  connected = false;
  emitted: Array<{ event: string; args: unknown[] }> = [];
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  on(event: string, listener: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener?: (...args: any[]) => void) {
    if (!listener) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    this.emitted.push({ event, args });
    return this;
  }

  connect() {
    this.connected = true;
    this.fire('connect');
    return this;
  }

  disconnect() {
    this.connected = false;
    this.fire('disconnect');
    return this;
  }

  fire(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

const UNLOCK_PAYLOAD = {
  id: 'n-1',
  achievementId: 'first-solve',
  title: 'First Solve',
  message: 'You unlocked "First Solve".',
  type: 'reward',
  unlockedAt: '2026-01-01T00:00:00.000Z',
};

describe('normalizeAchievementUnlock', () => {
  it('normalizes a dedicated achievementUnlocked event', () => {
    const event = normalizeAchievementUnlock('achievementUnlocked', {
      achievementId: 'speed-demon',
      title: 'Speed Demon',
    });
    expect(event).toMatchObject({
      id: 'speed-demon',
      achievementId: 'speed-demon',
      title: 'Speed Demon',
    });
  });

  it('recognizes in-app notification payloads for achievement unlocks', () => {
    const event = normalizeAchievementUnlock('notification', UNLOCK_PAYLOAD);
    expect(event).toMatchObject({
      id: 'first-solve',
      title: 'First Solve',
      description: 'You unlocked "First Solve".',
    });
  });

  it('ignores unrelated notifications', () => {
    expect(
      normalizeAchievementUnlock('notification', {
        id: 'x',
        title: 'New puzzle available',
        type: 'puzzle',
      }),
    ).toBeNull();
  });
});

describe('useAchievementUnlock', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    socket = new FakeSocket();
  });

  it('subscribes to the user room and collects unlocks', async () => {
    const onUnlock = vi.fn();
    const { result } = renderHook(() =>
      useAchievementUnlock({ socket, userId: 'user-1', onUnlock }),
    );

    act(() => socket.connect());
    expect(result.current.isConnected).toBe(true);
    expect(socket.emitted).toContainEqual({
      event: 'subscribe',
      args: [{ userId: 'user-1' }],
    });

    act(() => socket.fire('achievementUnlocked', UNLOCK_PAYLOAD));

    await waitFor(() => expect(result.current.achievements).toHaveLength(1));
    expect(result.current.achievements[0]).toMatchObject({
      id: 'first-solve',
      title: 'First Solve',
    });
    expect(result.current.latestAchievement?.id).toBe('first-solve');
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates already-seen achievements', async () => {
    const onUnlock = vi.fn();
    const { result } = renderHook(() =>
      useAchievementUnlock({ socket, onUnlock }),
    );
    act(() => socket.connect());

    act(() => {
      socket.fire('achievementUnlocked', UNLOCK_PAYLOAD);
      socket.fire('achievementUnlocked', UNLOCK_PAYLOAD);
      socket.fire('notification', UNLOCK_PAYLOAD);
    });

    await waitFor(() => expect(result.current.achievements).toHaveLength(1));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('supports onUnlock callback registration and unsubscribe', async () => {
    const { result } = renderHook(() => useAchievementUnlock({ socket }));
    act(() => socket.connect());

    const listener = vi.fn();
    let unsubscribe: () => void = () => {};
    act(() => {
      unsubscribe = result.current.onUnlock(listener);
    });

    act(() => socket.fire('achievementUnlocked', UNLOCK_PAYLOAD));
    expect(listener).toHaveBeenCalledTimes(1);

    act(() => unsubscribe());
    act(() => socket.fire('achievementUnlocked', { ...UNLOCK_PAYLOAD, id: 'n-2', achievementId: 'second' }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('re-subscribes to the room after a reconnect', async () => {
    const { result } = renderHook(() =>
      useAchievementUnlock({ socket, userId: 42 }),
    );
    act(() => socket.connect());
    act(() => socket.disconnect());
    expect(result.current.isConnected).toBe(false);

    socket.emitted = [];
    act(() => socket.connect());
    expect(result.current.isConnected).toBe(true);
    expect(socket.emitted).toContainEqual({
      event: 'subscribe',
      args: [{ userId: 42 }],
    });
  });

  it('clear() resets seen achievements so replays are accepted again', async () => {
    const { result } = renderHook(() => useAchievementUnlock({ socket }));
    act(() => socket.connect());

    act(() => socket.fire('achievementUnlocked', UNLOCK_PAYLOAD));
    await waitFor(() => expect(result.current.achievements).toHaveLength(1));

    act(() => result.current.clear());
    expect(result.current.achievements).toHaveLength(0);

    act(() => socket.fire('achievementUnlocked', UNLOCK_PAYLOAD));
    await waitFor(() => expect(result.current.achievements).toHaveLength(1));
  });
});
